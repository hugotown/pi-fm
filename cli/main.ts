// pifm: deterministic operations of the pi-fm harness. Every state change the supervisor or a
// crew member makes goes through here, so the model never edits bookkeeping by hand.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, paths, ROOT, taskDir } from "../lib/home.ts";
import { hasCommand, run } from "../lib/exec.ts";
import { appendStatus, openDecisions, readStatus } from "../lib/status.ts";
import { liveTaskIds, readMeta, writeMeta } from "../lib/meta.ts";
import { addItem, completeItem, loadBacklog, renderBacklog, startItem } from "../lib/backlog.ts";
import { ack, formatWakes, pending } from "../lib/wake.ts";
import { logEvent } from "../lib/events.ts";
import { addProject, getProject, listProjects, projectDir, syncProject } from "../lib/projects.ts";
import { formatProfile, loadTable, resolve } from "../lib/dispatch.ts";
import { taskFile, writeBrief } from "../lib/brief.ts";
import { integrate } from "../lib/integrate.ts";
import { triage } from "../lib/triage.ts";
import { merge, mergeLocal, prStatus, ship, teardown, verify } from "../lib/ship.ts";
import { closePane, paneState, promptPane, startPane } from "../lib/pane.ts";
import { doorbell, writeInbox } from "../lib/inbox.ts";
import { answer, hold, listHolds } from "../lib/holds.ts";
import { bearings } from "../lib/bearings.ts";
import { addSecondmate, listSecondmates, startSecondmate } from "../lib/secondmates.ts";

type Flags = Record<string, string | true>;

function parse(argv: string[]): { pos: string[]; flags: Flags } {
  const pos: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) flags[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const str = (f: Flags, k: string) => (typeof f[k] === "string" ? (f[k] as string) : undefined);
function need<T>(v: T | undefined, what: string): T {
  if (v === undefined || v === "") throw new Error(`missing ${what}`);
  return v;
}

const USAGE = `pifm <command> ...

Setup      init | doctor | update | version
Projects   project add <name> <remote> [--mode pr|local] [--yolo] [--desc text] | project list | project sync <name>
Tasks      task new <id> --project <p> --title <t> [--kind ship|scout] [--epic e] [--verify cmd]
           (write $PIFM_HOME/data/<id>/task.md with "## Intent" and "## Spec" first)
           brief <id> | resolve [rule] | rules
Crew       status <id> <verb> [--key k] "<text>"   (verbs: working paused note done failed needs-decision blocked resolved)
           log <id> | meta <id> [key=value ...] | send <id> "<text>" | pane start <id> --harness h [--model m] [--effort e] [--cwd dir] [--prompt text]
           pane state <id> | pane close <id>
Pipeline   integrate <id> [--handoff file] | verify <id> | triage <id> <round>
           ship <id> | pr <id> | merge <id> | merge-local <id> | teardown <id> [--discard]
Backlog    backlog [list] | backlog done <id> "<note>"
Captain    hold <id> "<question>" [--key k] [--until date] | holds | answer <id> "<exact words>"
           afk away "<words>" | afk quiet | afk off | afk show | bearings
Supervisor wakes | ack <seq> | event <KIND> "<text>" | inflight
Secondmates secondmate add <name> --scope "<text>" | secondmate list | secondmate start <name>`;

function init(): void {
  const p = paths();
  for (const d of [p.config, p.data, p.state, p.projects, p.worktrees, join(p.home, ".pi")]) ensureDir(d);
  // pi loads the harness package and its config from the home, which is the supervisor's cwd.
  writeFileSync(join(p.home, ".pi", "settings.json"), JSON.stringify({ packages: [ROOT] }, null, 2) + "\n");
  copyFileSync(join(ROOT, "templates", "home", "AGENTS.md"), join(p.home, "AGENTS.md"));
  for (const f of ["dispatch.json", "harnesses.json"]) {
    if (!existsSync(join(p.config, f))) copyFileSync(join(ROOT, "templates", "config", f), join(p.config, f));
  }
  if (!existsSync(join(p.home, ".pi", "aliases.json"))) copyFileSync(join(ROOT, "templates", "config", "aliases.json"), join(p.home, ".pi", "aliases.json"));
  const memory: Record<string, string> = {
    "captain.md": "# Captain\n\nDurable preferences and standing instructions from the captain, newest last.\n",
    "learnings.md": "# Learnings\n\nOperational lessons worth keeping across sessions.\n",
    "memory-archive.md": "# Memory archive\n\nCold entries moved out of captain.md and learnings.md by /stow.\n",
    "secondmates.md": "# Secondmates\n\n",
  };
  for (const [f, body] of Object.entries(memory)) if (!existsSync(join(p.data, f))) writeFileSync(join(p.data, f), body);
  if (!existsSync(join(p.data, "backlog.md"))) writeFileSync(join(p.data, "backlog.md"), renderBacklog(loadBacklog()));
  console.log(`initialised ${p.home}`);
}

function doctor(): number {
  let bad = 0;
  const line = (ok: boolean, what: string) => {
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  };
  for (const tool of ["node", "pi", "git", "gh", "herdr", "jq"]) line(hasCommand(tool), `${tool} installed`);
  line(run("gh", ["auth", "status"], { timeoutMs: 30_000 }).code === 0, "gh authenticated");
  line(!!run("git", ["config", "user.email"]).stdout.trim() || !!process.env.GIT_AUTHOR_EMAIL, "git identity set");
  line(existsSync(join(paths().home, ".pi", "settings.json")), `home initialised at ${paths().home}`);
  for (const rule of [...loadTable().rules.map((r) => r.name), undefined]) {
    try {
      console.log(`ok   ${formatProfile(resolve(rule))}`);
    } catch (e) {
      line(false, `rule ${rule ?? "default"}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  for (const pr of listProjects()) line(existsSync(projectDir(pr.name)), `project ${pr.name} cloned`);
  return bad ? 1 : 0;
}

function inflight(): string {
  const rows = liveTaskIds().map((id) => {
    const m = readMeta(id);
    const last = readStatus(id).slice(-1)[0];
    const open = openDecisions(readStatus(id)).map((d) => d.key).join(",");
    return `${id} stage=${m.stage ?? "-"} mechanism=${m.mechanism ?? "-"} ${m.pr ? `pr=${m.pr} ` : ""}${open ? `open=${open} ` : ""}last=${last ? `${last.verb}: ${last.text}` : "-"}`;
  });
  return rows.join("\n") || "no tasks in flight";
}

export function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const { pos, flags } = parse(rest);
  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      return 0;
    case "version": {
      const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
      console.log(pkg.version);
      return 0;
    }
    case "init":
      init();
      return 0;
    case "doctor":
      return doctor();
    case "update": {
      const res = run("git", ["-C", ROOT, "pull", "--ff-only"], { timeoutMs: 120_000 });
      console.log(res.stdout + res.stderr);
      if (res.code === 0) console.log("reread: run /reload in the supervisor session to load the updated harness");
      return res.code;
    }
    case "project": {
      const [sub, name, remote] = pos;
      if (sub === "add") {
        const p = addProject(need(name, "name"), need(remote, "remote"), { mode: str(flags, "mode") as "pr" | "local" | undefined, yolo: flags.yolo === true, description: str(flags, "desc") });
        console.log(`registered ${p.name} [${p.mode}${p.yolo ? " +yolo" : ""}] at ${projectDir(p.name)}`);
      } else if (sub === "sync") console.log(syncProject(need(name, "name")));
      else console.log(listProjects().map((p) => `${p.name} [${p.mode}${p.yolo ? " +yolo" : ""}] ${p.remote} ${projectDir(p.name)}`).join("\n") || "no projects");
      return 0;
    }
    case "task": {
      const [sub, id] = pos;
      if (sub !== "new") throw new Error("usage: pifm task new <id> --project p --title t");
      const project = need(str(flags, "project"), "--project");
      getProject(project);
      if (!existsSync(taskFile(need(id, "id")))) throw new Error(`write ${taskFile(id)} first`);
      const kind = (str(flags, "kind") ?? "ship") as "ship" | "scout";
      addItem(id, need(str(flags, "title"), "--title"), { project, kind, epic: str(flags, "epic") });
      writeMeta(id, { project, kind, title: str(flags, "title")!, epic: str(flags, "epic") ?? "", verify: str(flags, "verify") ?? "", stage: "queued" });
      console.log(`queued ${id}`);
      return 0;
    }
    case "brief": {
      const id = need(pos[0], "id");
      const m = readMeta(id);
      console.log(writeBrief({ id, project: m.project, projectDir: projectDir(m.project), kind: (m.kind as "ship" | "scout") || "ship", verify: m.verify }));
      return 0;
    }
    case "rules":
      console.log(loadTable().rules.map((r) => `${r.name}: ${r.when}`).join("\n"));
      return 0;
    case "resolve":
      console.log(formatProfile(resolve(pos[0])));
      return 0;
    case "status": {
      const [id, verb, ...text] = pos;
      console.log(appendStatus(need(id, "id"), need(verb, "verb"), need(text.join(" "), "text"), str(flags, "key")));
      return 0;
    }
    case "log": {
      const id = need(pos[0], "id");
      const lines = readStatus(id);
      console.log(lines.map((l) => `${l.verb}${l.key ? ` key=${l.key}` : ""}: ${l.text}`).join("\n") || "no status yet");
      const open = openDecisions(lines);
      if (open.length) console.log(`OPEN: ${open.map((d) => `${d.key} (${d.verb}: ${d.text})`).join("; ")}`);
      return 0;
    }
    case "meta": {
      const [id, ...pairs] = pos;
      const updates = Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
      const meta = pairs.length ? writeMeta(need(id, "id"), updates) : readMeta(need(id, "id"));
      console.log(Object.entries(meta).map(([k, v]) => `${k}=${v}`).join("\n"));
      return 0;
    }
    case "send": {
      const [id, ...text] = pos;
      const file = writeInbox(need(id, "id"), need(text.join(" "), "text"));
      const m = readMeta(id);
      if (m.mechanism === "pane") {
        promptPane(id, doorbell(id, file));
        console.log(`delivered ${file} to pane ${m.pane_id}`);
      } else console.log(`recorded ${file}; steer the run with: subagent({action:"steer", id:"${m.run_id}", message:"${doorbell(id, file)}"})`);
      return 0;
    }
    case "pane": {
      const [sub, id] = pos;
      if (sub === "start") {
        const res = startPane({
          id: need(id, "id"),
          harness: need(str(flags, "harness"), "--harness"),
          model: str(flags, "model"),
          effort: str(flags, "effort"),
          cwd: str(flags, "cwd") ?? readMeta(id).worktree ?? process.cwd(),
          prompt: str(flags, "prompt") ?? `Read and execute the brief at ${join(taskDir(id), "brief.md")}.`,
        });
        console.log(`pane ${res.pane} (tab ${res.tab}) state=${res.state}`);
        return res.state === "working" ? 0 : 3;
      }
      if (sub === "state") console.log(paneState(need(id, "id")));
      else if (sub === "close") closePane(need(id, "id"));
      else throw new Error("usage: pifm pane start|state|close <id>");
      return 0;
    }
    case "integrate": {
      const id = need(pos[0], "id");
      try {
        const r = integrate(id, str(flags, "handoff"));
        appendStatus(id, "note", `integrated as ${r.head.slice(0, 12)}`);
        logEvent("phase", `${id} integrate ok ${r.head.slice(0, 12)}`);
        console.log(`integrated ${id} at ${r.head}\n${r.files}`);
        return 0;
      } catch (e) {
        logEvent("phase", `${id} integrate failed`);
        throw e;
      }
    }
    case "verify": {
      const id = need(pos[0], "id");
      const r = verify(id);
      logEvent("phase", `${id} verify ${r.ok ? "pass" : `fail at ${r.step}`}`);
      console.log(`${r.ok ? "PASS" : `FAIL (${r.step})`} log=${r.log}`);
      if (!r.ok) console.log(readFileSync(r.log, "utf8").slice(-3000));
      return r.ok ? 0 : 1;
    }
    case "triage": {
      const id = need(pos[0], "id");
      const round = Number(need(pos[1], "round"));
      const v = triage(id, round);
      writeMeta(id, { round: String(round) });
      logEvent("phase", `${id} review round ${round} ${v.outcome}`);
      console.log(readFileSync(join(taskDir(id), "review", `round-${round}`, "verdict.md"), "utf8"));
      return { clean: 0, fix: 10, "ask-user": 20 }[v.outcome];
    }
    case "ship": {
      const id = need(pos[0], "id");
      const r = ship(id, str(flags, "title") ?? readMeta(id).title ?? id);
      appendStatus(id, "note", `PR ${r.pr} at ${r.head.slice(0, 12)}`);
      logEvent("pr", `${id} ${r.pr}`);
      console.log(`${r.pr} head=${r.head}`);
      return 0;
    }
    case "pr": {
      const s = prStatus(need(pos[0], "id"));
      console.log(`${s.state} head=${s.head} ${s.detail}`);
      return 0;
    }
    case "merge": {
      const id = need(pos[0], "id");
      const pr = merge(id);
      logEvent("merged", `${id} ${pr}`);
      console.log(`merged ${pr}`);
      return 0;
    }
    case "merge-local": {
      const id = need(pos[0], "id");
      console.log(`fast-forwarded to ${mergeLocal(id)}`);
      logEvent("merged", `${id} local`);
      return 0;
    }
    case "teardown": {
      const id = need(pos[0], "id");
      const m = readMeta(id);
      if (m.pane_id) closePane(id);
      const how = teardown(id, { discard: flags.discard === true });
      const statusLog = join(paths().state, `${id}.status`);
      if (existsSync(statusLog)) copyFileSync(statusLog, join(taskDir(id), "status.log"));
      for (const f of [`${id}.status`, `${id}.meta`]) run("rm", ["-f", join(paths().state, f)]);
      try {
        completeItem(id, how === "landed" ? (m.pr ? `merged ${m.pr}` : "merged locally") : "discarded by the captain");
      } catch {}
      logEvent("done", `${id} ${how}${m.pr ? ` pr=${m.pr}` : ""}`);
      console.log(`${id} ${how}`);
      return 0;
    }
    case "backlog": {
      const [sub, id, ...note] = pos;
      if (sub === "done") completeItem(need(id, "id"), note.join(" ") || "done");
      else if (sub === "start") startItem(need(id, "id"));
      console.log(readFileSync(join(paths().data, "backlog.md"), "utf8"));
      return 0;
    }
    case "hold": {
      const [id, ...q] = pos;
      const h = hold(need(id, "id"), need(q.join(" "), "question"), { key: str(flags, "key"), until: str(flags, "until") });
      logEvent("hold", `${id} ${h.question.split("\n")[0]}`);
      console.log(`held ${id}`);
      return 0;
    }
    case "holds":
      console.log(listHolds().map((h) => `${h.id}${h.key ? ` key=${h.key}` : ""} since ${h.since}: ${h.question}`).join("\n\n") || "no open holds");
      return 0;
    case "answer": {
      const [id, ...words] = pos;
      answer(need(id, "id"), need(words.join(" "), "answer"));
      logEvent("answer", id);
      console.log(`recorded answer for ${id}`);
      return 0;
    }
    case "afk": {
      const [mode, ...words] = pos;
      const file = join(paths().state, ".afk");
      if (mode === "away" || mode === "quiet") writeFileSync(file, `${mode}\n${new Date().toISOString()}\n${words.join(" ")}\n`);
      else if (mode === "off") run("rm", ["-f", file]);
      console.log(existsSync(file) ? readFileSync(file, "utf8") : "present");
      return 0;
    }
    case "bearings":
      console.log(bearings());
      return 0;
    case "wakes":
      console.log(formatWakes(pending()) || "no pending wakes");
      return 0;
    case "ack": {
      const left = ack(Number(need(pos[0], "seq")));
      console.log(`acknowledged through ${pos[0]}; ${left} pending`);
      return 0;
    }
    case "event":
      console.log(logEvent(need(pos[0], "kind"), pos.slice(1).join(" ")));
      return 0;
    case "inflight":
      console.log(inflight());
      return 0;
    case "secondmate": {
      const [sub, name] = pos;
      if (sub === "add") console.log(addSecondmate(need(name, "name"), need(str(flags, "scope"), "--scope")));
      else if (sub === "start") console.log(startSecondmate(need(name, "name")));
      else console.log(listSecondmates().map((s) => `${s.name} scope: ${s.scope} home: ${s.home}`).join("\n") || "no secondmates");
      return 0;
    }
    default:
      console.error(`unknown command ${cmd}\n\n${USAGE}`);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`pifm: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
