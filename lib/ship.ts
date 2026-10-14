// Verify, ship and teardown of one task branch. Merge only with live proof: checks green at the
// exact head that was reviewed (gh --match-head-commit), never on red or unreported checks.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskDir } from "./home.ts";
import { git, mustRun, run } from "./exec.ts";
import { readMeta, writeMeta } from "./meta.ts";
import { defaultBranch, getProject, githubSlug, projectDir, syncProject } from "./projects.ts";
import { branchName, worktreePath } from "./integrate.ts";

function taskWorktree(id: string): string {
  const wt = readMeta(id).worktree || worktreePath(id);
  if (!existsSync(wt)) throw new Error(`${id} has no task worktree at ${wt}; integrate a crew handoff first`);
  return wt;
}

// Rebase onto the default branch, then run the task's verify command. Logs go to data/<id>/checks/.
export function verify(id: string): { ok: boolean; log: string; step: string } {
  const meta = readMeta(id);
  const wt = taskWorktree(id);
  const checks = join(taskDir(id), "checks");
  mkdirSync(checks, { recursive: true });
  const n = Number(meta.verify_runs || 0) + 1;
  const log = join(checks, `verify-${n}.log`);
  writeMeta(id, { verify_runs: String(n) });

  if (git(wt, ["status", "--porcelain"])) {
    writeFileSync(log, "worktree is dirty; commit or discard first\n" + git(wt, ["status", "--short"]));
    return { ok: false, log, step: "clean" };
  }
  const base = defaultBranch(projectDir(meta.project));
  git(wt, ["fetch", "--quiet", "origin", base]);
  const rebase = run("git", ["rebase", "--quiet", `origin/${base}`], { cwd: wt, timeoutMs: 120_000 });
  if (rebase.code !== 0) {
    run("git", ["rebase", "--abort"], { cwd: wt });
    writeFileSync(log, `rebase onto origin/${base} failed:\n${rebase.stderr}${rebase.stdout}`);
    return { ok: false, log, step: "rebase" };
  }
  writeMeta(id, { head: git(wt, ["rev-parse", "HEAD"]) });
  if (!meta.verify) {
    writeFileSync(log, "no verify command recorded for this task (pifm meta set <id> verify=<cmd>)\n");
    return { ok: false, log, step: "verify" };
  }
  const timeoutMs = Number(meta.verify_timeout_s || 1800) * 1000;
  const res = run("bash", ["-lc", meta.verify], { cwd: wt, timeoutMs });
  writeFileSync(log, `$ ${meta.verify}\n(exit ${res.code})\n\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`);
  return { ok: res.code === 0, log, step: "verify" };
}

function prBody(id: string): string {
  const read = (f: string) => (existsSync(join(taskDir(id), f)) ? readFileSync(join(taskDir(id), f), "utf8").trim() : "");
  const task = read("task.md");
  const intent = /## Intent\s*\n([\s\S]*?)(?=\n## |$)/.exec(task)?.[1].trim() ?? "";
  const meta = readMeta(id);
  const round = meta.round ? read(join("review", `round-${meta.round}`, "verdict.md")) : "";
  return [`## Intent\n\n${intent}`, `## Report\n\n${read("report.md")}`, round && `## Review\n\n${round}`, `Task \`${id}\` shipped by pi-fm.`]
    .filter(Boolean)
    .join("\n\n");
}

// Push the branch and open (or update) its pull request.
export function ship(id: string, title: string): { pr: string; head: string } {
  const meta = readMeta(id);
  const project = getProject(meta.project);
  if (project.mode !== "pr") throw new Error(`${meta.project} is a local-only project; use: pifm merge-local ${id}`);
  const slug = githubSlug(project.remote);
  if (!slug) throw new Error(`cannot derive owner/repo from ${project.remote}`);
  const wt = taskWorktree(id);
  const head = git(wt, ["rev-parse", "HEAD"]);
  git(wt, ["push", "--quiet", "--force-with-lease", "-u", "origin", `HEAD:refs/heads/${branchName(id)}`]);
  let pr = meta.pr;
  if (!pr) {
    const bodyFile = join(taskDir(id), "pr-body.md");
    writeFileSync(bodyFile, prBody(id));
    const base = defaultBranch(projectDir(meta.project));
    pr = mustRun("gh", ["pr", "create", "--repo", slug, "--base", base, "--head", branchName(id), "--title", title, "--body-file", bodyFile], { cwd: wt, timeoutMs: 120_000 }).trim().split("\n").pop()!;
  }
  writeMeta(id, { pr, pr_head: head, stage: "shipping" });
  return { pr, head };
}

export type PrState = "pending" | "green" | "red" | "merged" | "closed" | "draft";

export interface PrStatus {
  state: PrState;
  head: string;
  detail: string;
}

interface Check {
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string;
  state?: string;
}

// Reads the live PR; consumed by scripts only.
export function prStatus(id: string): PrStatus {
  const meta = readMeta(id);
  if (!meta.pr) throw new Error(`${id} has no PR`);
  const out = mustRun("gh", ["pr", "view", meta.pr, "--json", "state,isDraft,headRefOid,mergeable,statusCheckRollup"], { timeoutMs: 60_000 });
  const v = JSON.parse(out) as { state: string; isDraft: boolean; headRefOid: string; mergeable: string; statusCheckRollup: Check[] };
  if (v.state === "MERGED") return { state: "merged", head: v.headRefOid, detail: "merged" };
  if (v.state === "CLOSED") return { state: "closed", head: v.headRefOid, detail: "closed without merge" };
  if (v.isDraft) return { state: "draft", head: v.headRefOid, detail: "draft" };
  const checks = v.statusCheckRollup ?? [];
  const name = (c: Check) => c.name || c.context || "check";
  const failed = checks.filter((c) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes((c.conclusion || c.state || "").toUpperCase()));
  if (failed.length) return { state: "red", head: v.headRefOid, detail: `failed: ${failed.map(name).join(", ")}` };
  const done = (c: Check) => (c.status ? c.status.toUpperCase() === "COMPLETED" : ["SUCCESS", "NEUTRAL", "SKIPPED"].includes((c.state || "").toUpperCase()));
  if (!checks.length) return { state: "pending", head: v.headRefOid, detail: "no checks reported yet" };
  const waiting = checks.filter((c) => !done(c));
  if (waiting.length) return { state: "pending", head: v.headRefOid, detail: `waiting: ${waiting.map(name).join(", ")}` };
  if (v.mergeable === "CONFLICTING") return { state: "red", head: v.headRefOid, detail: "merge conflict with base" };
  return { state: "green", head: v.headRefOid, detail: `${checks.length} checks passed` };
}

export function merge(id: string): string {
  const meta = readMeta(id);
  const s = prStatus(id);
  if (s.state === "merged") return meta.pr;
  if (s.state !== "green") throw new Error(`refusing to merge ${meta.pr}: ${s.state} (${s.detail})`);
  if (s.head !== meta.pr_head) throw new Error(`refusing to merge: PR head ${s.head} is not the reviewed head ${meta.pr_head}`);
  mustRun("gh", ["pr", "merge", meta.pr, "--squash", "--match-head-commit", meta.pr_head], { timeoutMs: 120_000 });
  const after = prStatus(id);
  if (after.state !== "merged") throw new Error(`merge of ${meta.pr} not confirmed (state ${after.state})`);
  writeMeta(id, { stage: "merged" });
  return meta.pr;
}

// local-only projects: fast-forward the default branch of the clone and push nothing.
export function mergeLocal(id: string): string {
  const meta = readMeta(id);
  const repo = projectDir(meta.project);
  const base = defaultBranch(repo);
  if (git(repo, ["status", "--porcelain"])) throw new Error(`${repo} is dirty`);
  git(repo, ["checkout", "--quiet", base]);
  git(repo, ["merge", "--ff-only", "--quiet", branchName(id)]);
  writeMeta(id, { stage: "merged" });
  return git(repo, ["rev-parse", "HEAD"]);
}

// Remove the task worktree and branch, only once the work is proven landed (or discard is explicit).
export function teardown(id: string, opts: { discard?: boolean } = {}): string {
  const meta = readMeta(id);
  const repo = projectDir(meta.project);
  const wt = meta.worktree || worktreePath(id);
  let landed = meta.stage === "merged";
  if (!landed && meta.pr) landed = prStatus(id).state === "merged";
  if (!landed && !opts.discard) throw new Error(`${id} is not proven landed; refusing teardown (discard needs the captain's explicit word)`);
  if (existsSync(wt)) {
    if (!opts.discard && git(wt, ["status", "--porcelain"])) throw new Error(`${wt} has uncommitted work; refusing teardown`);
    git(repo, ["worktree", "remove", ...(opts.discard ? ["--force"] : []), wt]);
  }
  run("git", ["branch", "-D", branchName(id)], { cwd: repo });
  if (getProject(meta.project).mode === "pr") syncProject(meta.project);
  return landed ? "landed" : "discarded";
}
