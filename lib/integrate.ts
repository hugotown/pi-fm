// Turns a pi-subagents worktree handoff (patch + manifest) into a commit on pifm/<id>,
// in the task worktree $PIFM_HOME/worktrees/<id>. The supervisor never edits project files itself.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { paths, taskDir } from "./home.ts";
import { git, run } from "./exec.ts";
import { readMeta, writeMeta } from "./meta.ts";
import { projectDir } from "./projects.ts";

export interface HandoffChild {
  status: string;
  summary?: string;
  patch?: { path: string; changed: boolean };
}

export interface Handoff {
  runId: string;
  groups: { baseCommit: string; children: HandoffChild[] }[];
}

export const branchName = (id: string) => `pifm/${id}`;
export const worktreePath = (id: string) => join(paths().worktrees, id);

function sessionRoots(): string[] {
  const roots = [join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "sessions")];
  return roots.filter(existsSync);
}

// The manifest lives in the launching session's artifact dir: sessions/<session>/subagent-artifacts/handoffs/<runId>.json
export function findHandoff(runId: string): string | null {
  for (const root of sessionRoots()) {
    for (const session of readdirSync(root)) {
      const file = join(root, session, "subagent-artifacts", "handoffs", `${runId}.json`);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

export function readHandoff(file: string): Handoff {
  return JSON.parse(readFileSync(file, "utf8")) as Handoff;
}

// Creates the task worktree on its branch if missing; returns its path.
export function ensureTaskWorktree(id: string, project: string, base: string): string {
  const wt = worktreePath(id);
  if (existsSync(wt)) return wt;
  const repo = projectDir(project);
  const branch = branchName(id);
  const exists = run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo }).code === 0;
  git(repo, exists ? ["worktree", "add", "--quiet", wt, branch] : ["worktree", "add", "--quiet", "-b", branch, wt, base]);
  return wt;
}

export function integrate(id: string, handoffPath?: string): { head: string; files: string } {
  const meta = readMeta(id);
  if (!meta.project) throw new Error(`${id} has no project in its meta`);
  const runId = meta.run_id;
  const file = handoffPath ?? (runId ? findHandoff(runId) : null);
  if (!file) throw new Error(`no handoff manifest yet for ${id} (run ${runId ?? "unknown"}); the run may still be capturing its patch`);
  const handoff = readHandoff(file);
  if (meta.integrated_run && meta.integrated_run === handoff.runId) throw new Error(`run ${handoff.runId} is already integrated into ${branchName(id)}`);
  const group = handoff.groups[0];
  const child = group?.children[0];
  if (!child || child.status !== "completed") throw new Error(`run ${handoff.runId} did not complete (status ${child?.status ?? "missing"})`);
  if (!child.patch?.changed || !child.patch.path) throw new Error(`run ${handoff.runId} produced no changes`);

  const wt = ensureTaskWorktree(id, meta.project, group.baseCommit);
  const ancestor = run("git", ["merge-base", "--is-ancestor", group.baseCommit, "HEAD"], { cwd: wt }).code === 0;
  if (!ancestor) throw new Error(`patch base ${group.baseCommit} is not in ${branchName(id)}; relaunch the round from refs/heads/${branchName(id)}`);
  const head = git(wt, ["rev-parse", "HEAD"]);
  if (head !== group.baseCommit) throw new Error(`${branchName(id)} moved to ${head} after the round started from ${group.baseCommit}; relaunch from the branch tip`);
  if (git(wt, ["status", "--porcelain"])) throw new Error(`task worktree ${wt} is dirty; refusing to apply`);

  const applied = run("git", ["apply", "--index", "--binary", child.patch.path], { cwd: wt });
  if (applied.code !== 0) throw new Error(`patch did not apply cleanly: ${applied.stderr.trim()}`);

  const report = join(taskDir(id), "report.md");
  const subject = existsSync(report) ? readFileSync(report, "utf8").split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() : undefined;
  const round = Number(meta.round || 0);
  const message = `${subject || `pifm: ${id}`}${round > 0 ? ` (review round ${round})` : ""}`.slice(0, 200);
  git(wt, ["commit", "--quiet", "-m", message]);
  const newHead = git(wt, ["rev-parse", "HEAD"]);
  writeMeta(id, { branch: branchName(id), worktree: wt, head: newHead, integrated_run: handoff.runId });
  return { head: newHead, files: git(wt, ["show", "--stat", "--format=", "HEAD"]) };
}
