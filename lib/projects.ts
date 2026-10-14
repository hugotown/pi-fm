// data/projects.md: registry of projects pi-fm works on, each cloned under $PIFM_HOME/projects/<name>.
//   - <name> [<mode>[ +yolo]] - <remote>: <description> (added YYYY-MM-DD)
// mode: "pr" (review gate, PR, CI, merge) or "local" (review gate, fast-forward merge, no forge).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, paths } from "./home.ts";
import { git, mustRun } from "./exec.ts";

export interface Project {
  name: string;
  mode: "pr" | "local";
  yolo: boolean;
  remote: string;
  description: string;
}

const LINE_RE = /^- ([a-z0-9][a-z0-9_-]*) \[(pr|local)( \+yolo)?\] - (\S+): (.*?)(?: \(added [0-9-]+\))?$/;

export function projectsFile(): string {
  return join(paths().data, "projects.md");
}

export function listProjects(): Project[] {
  if (!existsSync(projectsFile())) return [];
  return readFileSync(projectsFile(), "utf8")
    .split("\n")
    .map((l) => LINE_RE.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ name: m[1], mode: m[2] as Project["mode"], yolo: !!m[3], remote: m[4], description: m[5] }));
}

export function getProject(name: string): Project {
  const p = listProjects().find((x) => x.name === name);
  if (!p) throw new Error(`unknown project ${name}; register it with: pifm project add ${name} <remote>`);
  return p;
}

export function projectDir(name: string): string {
  return join(paths().projects, name);
}

export function addProject(name: string, remote: string, opts: { mode?: Project["mode"]; yolo?: boolean; description?: string }): Project {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error(`invalid project name ${name}`);
  if (listProjects().some((p) => p.name === name)) throw new Error(`project ${name} is already registered`);
  const dir = projectDir(name);
  ensureDir(paths().projects);
  if (!existsSync(dir)) mustRun("git", ["clone", "--quiet", remote, dir], { timeoutMs: 600_000 });
  const project: Project = { name, mode: opts.mode ?? "pr", yolo: !!opts.yolo, remote, description: opts.description ?? "" };
  ensureDir(paths().data);
  const head = existsSync(projectsFile()) ? readFileSync(projectsFile(), "utf8") : "# Projects\n\n";
  const line = `- ${name} [${project.mode}${project.yolo ? " +yolo" : ""}] - ${remote}: ${project.description} (added ${new Date().toISOString().slice(0, 10)})`;
  writeFileSync(projectsFile(), head.replace(/\n*$/, "\n") + line + "\n");
  return project;
}

// Bring the clone's default branch to origin's tip; the clone is never edited by hand.
export function syncProject(name: string): string {
  const dir = projectDir(name);
  git(dir, ["fetch", "--quiet", "--prune", "origin"]);
  const branch = defaultBranch(dir);
  const status = git(dir, ["status", "--porcelain"]);
  if (status) throw new Error(`project clone ${dir} is dirty; refusing to sync:\n${status}`);
  git(dir, ["checkout", "--quiet", branch]);
  git(dir, ["merge", "--ff-only", "--quiet", `origin/${branch}`]);
  return git(dir, ["rev-parse", "HEAD"]);
}

export function defaultBranch(dir: string): string {
  const ref = git(dir, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  return ref.replace(/^origin\//, "");
}

// owner/repo for GitHub remotes, used by gh.
export function githubSlug(remote: string): string | null {
  const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  return m ? m[1] : null;
}
