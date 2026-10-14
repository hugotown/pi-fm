// The pi-fm supervisor extension: the watcher that wakes the model only for actionable events,
// phase collapse, and the deterministic tools that launch crew and reviewers.
// Loads only in the supervisor session (PIFM_ROLE=primary, not a pi-subagents child).
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths, ROOT, taskDir } from "../lib/home.ts";
import { git, run } from "../lib/exec.ts";
import { liveTaskIds, readMeta, writeMeta } from "../lib/meta.ts";
import { appendStatus, parseStatus, statusFile, WAKE_VERBS } from "../lib/status.ts";
import { ack, enqueue, formatWakes, pending } from "../lib/wake.ts";
import { logEvent } from "../lib/events.ts";
import { formatProfile, resolve } from "../lib/dispatch.ts";
import { writeBrief } from "../lib/brief.ts";
import { startItem } from "../lib/backlog.ts";
import { defaultBranch, projectDir, syncProject } from "../lib/projects.ts";
import { branchName, ensureTaskWorktree, findHandoff, worktreePath } from "../lib/integrate.ts";
import { paneState, startPane } from "../lib/pane.ts";
import { roundDir, triage } from "../lib/triage.ts";
import { prStatus } from "../lib/ship.ts";
import { isPrimary } from "../lib/guard.ts";

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 60_000;
const HEARTBEAT_S = 20 * 60;
const STALE_S = 25 * 60;
const REDELIVER_S = 10 * 60;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: undefined });

export default function (pi: ExtensionAPI) {
  if (!isPrimary()) return;

  let busy = false;
  let lastSettledLeaf: string | null = null;
  let phase: { label: string; anchor: string | null } | null = null;
  let collapse: { label: string; anchor: string } | null = null;
  let delivered = { seq: 0, at: 0 };
  let lastHeartbeat = Math.floor(Date.now() / 1000);
  let timers: NodeJS.Timeout[] = [];
  const cursors = new Map<string, number>();

  // Queue behind a running turn instead of failing when the session is busy.
  const say = (msg: string) => pi.sendUserMessage(msg, busy ? { deliverAs: "followUp" } : undefined);

  const afk = (): "away" | "quiet" | null => {
    const file = join(paths().state, ".afk");
    if (!existsSync(file)) return null;
    const mode = readFileSync(file, "utf8").split("\n")[0].trim();
    return mode === "away" || mode === "quiet" ? mode : null;
  };

  const lockFile = () => join(paths().state, ".lock");
  const lockHolder = (): number | null => {
    try {
      const pid = Number(readFileSync(lockFile(), "utf8").trim());
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  };

  // --- watcher -------------------------------------------------------------------------------

  // New status lines become wakes. A subagent task's "done" waits until its handoff manifest
  // exists, so the supervisor can integrate as soon as it is woken.
  function scanStatus(): void {
    for (const id of liveTaskIds()) {
      const file = statusFile(id);
      if (!existsSync(file)) continue;
      const size = statSync(file).size;
      const from = cursors.get(id) ?? 0;
      if (size <= from) continue;
      const chunk = readFileSync(file, "utf8").slice(from);
      // The last element is "" after a trailing newline, or a partial line still being written.
      const complete = chunk.split("\n").slice(0, -1);
      let consumed = from;
      for (const raw of complete) {
        const line = parseStatus(raw);
        if (line && WAKE_VERBS.has(line.verb)) {
          const meta = readMeta(id);
          if (line.verb === "done" && meta.mechanism === "subagent" && meta.run_id && meta.integrated_run !== meta.run_id && !findHandoff(meta.run_id)) break;
          enqueue("signal", `${id}:${line.verb}:${line.key ?? line.at ?? ""}`, `${id} ${line.verb}${line.key ? ` key=${line.key}` : ""}: ${line.text}`);
        }
        consumed += Buffer.byteLength(raw + "\n");
      }
      cursors.set(id, consumed);
    }
    persistCursors();
  }

  function persistCursors(): void {
    writeFileSync(join(paths().state, ".watch-cursors"), JSON.stringify(Object.fromEntries(cursors)));
  }

  function loadCursors(): void {
    try {
      const saved = JSON.parse(readFileSync(join(paths().state, ".watch-cursors"), "utf8")) as Record<string, number>;
      for (const [k, v] of Object.entries(saved)) cursors.set(k, v);
    } catch {}
  }

  function slowChecks(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const id of liveTaskIds()) {
      const meta = readMeta(id);
      try {
        if (meta.stage === "shipping" && meta.pr) {
          const s = prStatus(id);
          if (s.state === "green") enqueue("check", `${id}:pr-green:${s.head}`, `${id} PR ${meta.pr} is green at ${s.head.slice(0, 12)} (${s.detail})`);
          else if (s.state === "red") enqueue("check", `${id}:pr-red:${s.head}`, `${id} PR ${meta.pr} is red: ${s.detail}`);
          else if (s.state === "merged") enqueue("check", `${id}:merged`, `${id} PR ${meta.pr} is merged; tear it down`);
          else if (s.state === "closed") enqueue("check", `${id}:closed`, `${id} PR ${meta.pr} was closed without merge`);
        }
        if (meta.mechanism === "pane" && meta.pane_id && (meta.stage === "building" || meta.stage === "fixing")) {
          const st = paneState(id);
          if (st === "blocked") enqueue("signal", `${id}:pane-blocked`, `${id} pane ${meta.pane_id} is waiting at a dialog or question; read it with herdr pane read ${meta.pane_id}`);
          if (st === "gone") enqueue("stale", `${id}:pane-gone`, `${id} pane ${meta.pane_id} is gone`);
        }
        if (meta.stage === "building" || meta.stage === "fixing") {
          const file = statusFile(id);
          const last = existsSync(file) ? Math.floor(statSync(file).mtimeMs / 1000) : Number(meta.dispatched_at || now);
          if (now - last > STALE_S) enqueue("stale", `${id}:stale:${last}`, `${id} has reported nothing for ${Math.round((now - last) / 60)} minutes`);
        }
      } catch (e) {
        enqueue("check", `${id}:check-error`, `${id} check failed: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    if (liveTaskIds().length && now - lastHeartbeat >= HEARTBEAT_S) {
      lastHeartbeat = now;
      enqueue("heartbeat", `heartbeat:${now}`, `${liveTaskIds().length} task(s) in flight; reconcile with pifm inflight`);
    }
  }

  // Deliver pending wakes as one user message, only while the session is idle.
  function deliver(): void {
    if (busy || collapse) return;
    let rows = pending();
    const mode = afk();
    if (mode) {
      const routine = rows.filter((w) => w.kind === "heartbeat");
      if (routine.length && routine.length === rows.length) {
        ack(Math.max(...routine.map((w) => w.seq)));
        return;
      }
      rows = rows.filter((w) => w.kind !== "heartbeat");
    }
    if (!rows.length) return;
    const maxSeq = Math.max(...rows.map((w) => w.seq));
    const now = Math.floor(Date.now() / 1000);
    if (maxSeq <= delivered.seq && now - delivered.at < REDELIVER_S) return;
    delivered = { seq: maxSeq, at: now };
    const note =
      mode === "away"
        ? "\nThe captain is away: do not ask them anything now; park decisions as holds (pifm hold) and keep everything else moving."
        : mode === "quiet"
          ? "\nQuiet mode: handle these without narrating routine progress to the captain."
          : "";
    logEvent("wake", `${rows.length} row(s) through #${maxSeq}`);
    pi.sendUserMessage(`PIFM_WAKE\n${formatWakes(rows)}${note}\nHandle every row, then run: pifm ack ${maxSeq}`);
  }

  function tick(slow: boolean): void {
    try {
      scanStatus();
      if (slow) slowChecks();
      deliver();
    } catch (e) {
      logEvent("watch-error", (e as Error).message);
    }
  }

  // --- lifecycle -----------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    mkdirSync(paths().state, { recursive: true });
    // One supervisor per home: a second session stays read-only (no watcher, no wakes).
    const holder = lockHolder();
    if (holder && holder !== process.pid) {
      logEvent("ready", `read-only: home is supervised by pid ${holder}`);
      ctx.ui.notify(`pi-fm: ${paths().home} is already supervised by pid ${holder}; this session is read-only.`, "warning");
      return;
    }
    writeFileSync(lockFile(), `${process.pid}\n`);
    loadCursors();
    lastSettledLeaf = ctx.sessionManager.getLeafId();
    timers.push(setInterval(() => tick(false), FAST_POLL_MS));
    timers.push(setInterval(() => tick(true), SLOW_POLL_MS));
    logEvent("ready", `home=${paths().home} pid=${process.pid}`);
    ctx.ui.setStatus("pifm", "pi-fm supervisor");
    // Run the session-start routine; its settled turn is also the anchor for the first phase.
    setTimeout(() => say("PIFM_SESSION_START: follow the Session start steps in AGENTS.md, then wait for the captain."), 1_000);
  });

  pi.on("session_shutdown", async () => {
    for (const t of timers) clearInterval(t);
    timers = [];
    if (lockHolder() === process.pid) rmSync(lockFile(), { force: true });
  });

  pi.on("agent_start", async () => {
    busy = true;
  });

  pi.on("agent_settled", async (_event, ctx) => {
    busy = false;
    if (collapse) {
      setTimeout(() => pi.sendUserMessage("/pifm-collapse", { expandPromptTemplates: true }), 300);
      return;
    }
    lastSettledLeaf = ctx.sessionManager.getLeafId();
    setTimeout(() => tick(false), 500);
  });

  // Collapse the finished phase into a summary. navigateTree is only safe once the run settled.
  pi.registerCommand("pifm-collapse", {
    description: "Collapse the finished pi-fm phase into a summary (run automatically)",
    handler: async (_args, ctx) => {
      const c = collapse;
      if (!c) return;
      const g = globalThis as { __boomerangCollapseInProgress?: boolean };
      g.__boomerangCollapseInProgress = true; // pi-rewind-hook skips its restore prompt
      let ok = false;
      try {
        await ctx.waitForIdle();
        const res = await ctx.navigateTree(c.anchor, {
          summarize: true,
          label: `pifm:${c.label}`,
          customInstructions:
            "Summarize this pi-fm phase for the supervisor that continues the flow. Keep verbatim: task ids, epic ids, file paths, branch names, PR URLs, run ids, open decisions and the captain's exact words. State what was decided, what was produced (with paths), and what comes next.",
        });
        ok = !res.cancelled;
      } catch (e) {
        logEvent("phase", `${c.label} collapse failed: ${(e as Error).message}`);
      } finally {
        g.__boomerangCollapseInProgress = false;
        collapse = null;
      }
      lastSettledLeaf = ctx.sessionManager.getLeafId();
      logEvent("phase", `${c.label} collapsed=${ok}`);
      say(`PIFM_PHASE_DONE ${c.label}. The phase summary is above and its results are in their files. Continue with the next step of the flow.`);
    },
  });

  // --- tools ---------------------------------------------------------------------------------

  pi.registerTool({
    name: "pifm_phase",
    label: "pi-fm phase",
    description:
      "Mark the start or end of a pi-fm phase (define, plan, or task:<id>). Ending a phase collapses its working context into a summary after the current turn, so write every result to its file before ending.",
    parameters: Type.Object({
      action: StringEnum(["start", "end"] as const),
      label: Type.String({ description: "Phase label, e.g. define:kiosk, plan:kiosk, task:kiosk-menu" }),
    }),
    async execute(_id, params) {
      if (params.action === "start") {
        phase = { label: params.label, anchor: lastSettledLeaf };
        logEvent("phase", `${params.label} start`);
        return text(`Phase ${params.label} started.`);
      }
      const anchor = phase?.anchor ?? lastSettledLeaf;
      logEvent("phase", `${params.label} end`);
      if (!anchor) return text(`Phase ${params.label} ended (nothing to collapse).`);
      collapse = { label: params.label, anchor };
      phase = null;
      return text(`Phase ${params.label} ended. Finish this turn now; its context will be collapsed into a summary and the flow continues automatically.`);
    },
  });

  pi.registerTool({
    name: "pifm_dispatch",
    label: "pi-fm dispatch",
    description:
      "Launch a crew member on a queued task: renders the brief, resolves the model from the dispatch table, and starts it in an isolated worktree (pi-subagents) or a herdr tab (other harnesses). Requires data/<id>/task.md and `pifm task new`.",
    parameters: Type.Object({
      id: Type.String({ description: "Task id" }),
      rule: Type.Optional(Type.String({ description: "Dispatch rule name (see `pifm rules`); defaults to the task's rule or build-bounded" })),
      note: Type.Optional(Type.String({ description: "Relaunch note appended to the brief: what the previous attempt did and why it is relaunched" })),
    }),
    async execute(_toolId, params, signal, _onUpdate, ctx) {
      const id = params.id;
      const meta = readMeta(id);
      if (!meta.project) throw new Error(`${id} is not a queued task; run pifm task new first`);
      const res = resolve(params.rule ?? meta.rule ?? "build-bounded");
      if (res.profile.mechanism === "external") throw new Error(`rule ${res.rule} resolved to an external read-only runner; pick a build rule`);
      const repo = projectDir(meta.project);
      syncProject(meta.project);
      const brief = writeBrief({ id, project: meta.project, projectDir: repo, kind: (meta.kind as "ship" | "scout") || "ship", verify: meta.verify });
      if (params.note) writeFileSync(brief, readFileSync(brief, "utf8") + `\n# Relaunch note\n\n${params.note}\n`);
      const hasBranch = run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branchName(id)}`], { cwd: repo }).code === 0;
      const base = hasBranch ? `refs/heads/${branchName(id)}` : `refs/remotes/origin/${defaultBranch(repo)}`;
      const prompt = `Read and execute the brief at ${brief}.`;
      const now = String(Math.floor(Date.now() / 1000));
      try {
        startItem(id);
      } catch {}

      if (res.profile.mechanism === "pane") {
        const wt = ensureTaskWorktree(id, meta.project, base);
        const r = startPane({ id, harness: res.profile.harness, model: res.profile.model, effort: res.profile.effort, cwd: wt, prompt });
        writeMeta(id, { stage: "building", rule: res.rule, model: res.profile.model ?? "", dispatched_at: now, worktree: wt, branch: branchName(id) });
        appendStatus(id, "note", `dispatched to ${res.profile.harness} in pane ${r.pane} (${r.state})`);
        logEvent("phase", `${id} build dispatched pane=${r.pane}`);
        return text(`${formatProfile(res)}\nStarted in herdr pane ${r.pane}, state ${r.state}. It commits directly on ${branchName(id)} in ${wt}.${r.state === "working" ? "" : " The agent is not ready: inspect the pane."}`);
      }

      const call = {
        agent: "pifm-crew",
        task: prompt,
        cwd: repo,
        worktree: true,
        baseRef: base,
        async: true,
        model: `${res.profile.model}${res.profile.effort ? `:${res.profile.effort}` : ""}`,
        acceptance: { level: "none", reason: "pi-fm handoff is plain text: status log and report.md" },
      };
      const out = await ctx.executeTool("subagent", call, { signal });
      const body = out.result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      const runId = (out.result.details as { runId?: string } | undefined)?.runId ?? /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/.exec(body)?.[1];
      if (out.isError || !runId) throw new Error(`subagent launch failed: ${body}`);
      writeMeta(id, { mechanism: "subagent", run_id: runId, stage: "building", rule: res.rule, model: call.model, dispatched_at: now, base });
      appendStatus(id, "note", `dispatched run ${runId} (${call.model}) from ${base}`);
      logEvent("phase", `${id} build dispatched run=${runId}`);
      return text(`${formatProfile(res)}\nRun ${runId} started from ${base}. Its "done" status line wakes you once the patch is captured; then run pifm integrate ${id}.`);
    },
  });

  pi.registerTool({
    name: "pifm_consult",
    label: "pi-fm consult",
    description:
      "Run one read-only agent (planner, verifier, scout) on a task and save its final text to a file under the home's data/ directory. The model comes from the dispatch rule; external codex/claude runners are used when the rule resolves to them.",
    parameters: Type.Object({
      rule: Type.String({ description: "Dispatch rule: plan, lookup, review, design, ..." }),
      agent: StringEnum(["pifm-planner", "pifm-verifier", "pifm-scout", "pifm-reviewer"] as const, { description: "pi agent used when the rule resolves to a pi model" }),
      task: Type.String({ description: "Complete instructions, including the paths to read and the output format" }),
      output: Type.String({ description: "Output file relative to data/, e.g. kiosk/plan.md" }),
      cwd: Type.Optional(Type.String({ description: "Working directory, e.g. a project clone or task worktree (default: the home)" })),
    }),
    async execute(_toolId, params, signal, _onUpdate, ctx) {
      const out = join(paths().data, params.output);
      if (!out.startsWith(paths().data + "/")) throw new Error("output must stay under data/");
      const res = resolve(params.rule);
      const external = res.profile.mechanism === "external";
      if (external && params.agent === "pifm-verifier") throw new Error("verification runs the system; use a rule that resolves to pi (e.g. lookup or build-bounded)");
      const agent = external ? (res.profile.harness === "claude" ? "claude-code" : "codex-exec") : params.agent;
      const model = res.profile.model && agent !== "codex-exec" ? `${res.profile.model}${res.profile.effort && !external ? `:${res.profile.effort}` : ""}` : undefined;
      const call: Record<string, unknown> = { agent, task: params.task, cwd: params.cwd ?? paths().home, async: false, ...(model ? { model } : {}) };
      if (!external) call.acceptance = { level: "none", reason: "plain-text document" };
      const r = await ctx.executeTool("subagent", call, { signal });
      const body = r.result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      if (r.isError) throw new Error(`${agent} failed: ${body}`);
      const doc = body.replace(/^Run fan-out:.*\n/, "").trim();
      mkdirSync(join(out, ".."), { recursive: true });
      writeFileSync(out, doc + "\n");
      logEvent("consult", `${params.rule} ${agent} -> ${params.output}`);
      return text(`${formatProfile(res)}\nSaved ${doc.length} characters to ${out}. First lines:\n${doc.split("\n").slice(0, 12).join("\n")}`);
    },
  });

  pi.registerTool({
    name: "pifm_review",
    label: "pi-fm review",
    description:
      "Run one review round on an integrated, verified task branch: three fresh reviewers (intent, tests, simplicity and security) read the diff and write findings; the round is triaged into data/<id>/review/round-<n>/verdict.md.",
    parameters: Type.Object({
      id: Type.String({ description: "Task id" }),
      round: Type.Number({ description: "Review round, starting at 1" }),
    }),
    async execute(_toolId, params, signal, _onUpdate, ctx) {
      const { id, round } = params;
      const meta = readMeta(id);
      const wt = meta.worktree || worktreePath(id);
      if (!existsSync(wt)) throw new Error(`${id} has no task worktree; integrate first`);
      const dir = roundDir(id, round);
      mkdirSync(dir, { recursive: true });
      const base = `origin/${defaultBranch(projectDir(meta.project))}`;
      git(wt, ["fetch", "--quiet", "origin"]);
      writeFileSync(join(dir, "diff.patch"), git(wt, ["diff", `${base}...HEAD`]));
      const res = resolve("review");
      const agent = res.profile.mechanism === "external" ? (res.profile.harness === "claude" ? "claude-code" : "codex-exec") : "pifm-reviewer";
      const task = (angle: string, focus: string) => `You are reviewing one change as the ${angle} reviewer. Read, in this order:
- ${join(taskDir(id), "task.md")} (the captain's intent and the spec: your acceptance criteria)
- ${join(dir, "diff.patch")} (the full change)
- the changed files in ${wt} where you need more context
${existsSync(join(taskDir(id), "checks")) ? `- the latest verify log in ${join(taskDir(id), "checks")}\n` : ""}${round > 1 ? `- ${join(roundDir(id, round - 1), "verdict.md")} (previous round; check those findings are fixed)\n` : ""}
Focus: ${focus}

Report only real problems. For each, write one line exactly in this form:
Finding: <P0|P1|P2> action=<auto-fix|ask-user> <file>:<line> - <problem and the fix>
P0 breaks the intent or loses data, P1 is a bug or missing requirement, P2 is a minor improvement. Use action=ask-user only when fixing it needs a decision about scope, product behaviour, cost, security or data that the task does not settle.
End with exactly one line: Merge verdict: BLOCK, Merge verdict: OK with notes, or Merge verdict: OK.
Plain text only. Do not edit any file.`;
      const angles: [string, string][] = [
        ["intent", "Does the change do what the captain asked, completely, and nothing outside the scope? Are docs and user-facing text updated?"],
        ["tests", "Is the behaviour verified by meaningful tests that would fail without the change? Do they cover the acceptance criteria and edge cases?"],
        ["simplicity-security", "Is it the simplest correct change? Look for bugs, dead code, needless abstraction, secrets, injection, unsafe defaults, resource leaks."],
      ];
      const model = res.profile.model ? `${res.profile.model}${res.profile.effort && res.profile.mechanism !== "external" ? `:${res.profile.effort}` : ""}` : undefined;
      const tasks = angles.map(([angle, focus]) => ({ key: angle, agent, task: task(angle, focus), cwd: wt, ...(model && agent !== "codex-exec" ? { model } : {}) }));
      const out = await ctx.executeTool("subagent", { workflow: join(ROOT, "workflows", "review-fanout.js"), args: { tasks }, async: false, cwd: wt }, { signal });
      const body = out.result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      if (out.isError) throw new Error(`review round failed: ${body}`);
      // The workflow returns each reviewer's prose separated by markers; split and file it.
      for (const [angle] of angles) {
        const m = new RegExp(`=== REVIEW ${angle} ===\\n([\\s\\S]*?)\\n=== END ${angle} ===`).exec(body);
        writeFileSync(join(dir, `${angle}.md`), m ? m[1].trim() + "\n" : `Reviewer output missing.\n\n${body.slice(0, 2000)}\n`);
      }
      const v = triage(id, round);
      writeMeta(id, { round: String(round) });
      logEvent("phase", `${id} review round ${round} ${v.outcome}`);
      return text(`${formatProfile(res)}\nRound ${round}: ${v.outcome}\n\n${readFileSync(join(dir, "verdict.md"), "utf8")}`);
    },
  });
}
