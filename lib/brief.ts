// data/<id>/brief.md: the only instructions a crew member receives. The supervisor writes the
// task content in data/<id>/task.md (## Intent, ## Spec); this module wraps it in the fixed contract.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, paths, ROOT, taskDir } from "./home.ts";

export interface BriefOptions {
  id: string;
  project: string;
  projectDir: string;
  kind: "ship" | "scout";
  verify?: string;
}

export function taskFile(id: string): string {
  return join(taskDir(id), "task.md");
}

// task.md must carry the captain's intent and the supervisor's spec, both non-empty.
export function checkTask(text: string): string[] {
  const problems: string[] = [];
  for (const section of ["Intent", "Spec"]) {
    const m = new RegExp(`^## ${section}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(text);
    if (!m || !m[1].trim()) problems.push(`task.md needs a non-empty "## ${section}" section`);
  }
  if (/\{[A-Z_]+\}|TODO|TBD/.test(text)) problems.push("task.md still has placeholders (TODO, TBD or {NAME})");
  return problems;
}

export function renderBrief(o: BriefOptions): string {
  const file = taskFile(o.id);
  if (!existsSync(file)) throw new Error(`write ${file} first (## Intent, ## Spec)`);
  const task = readFileSync(file, "utf8").trim();
  const problems = checkTask(task);
  if (problems.length) throw new Error(problems.join("\n"));
  const home = paths().home;
  const status = `PIFM_HOME=${home} ${ROOT}/bin/pifm status ${o.id}`;
  const report = join(taskDir(o.id), "report.md");
  const ship = o.kind === "ship";
  const includeFile = join(paths().config, "brief-include.md");
  const include = existsSync(includeFile) ? `\n# Standing instructions\n\n${readFileSync(includeFile, "utf8").trim()}\n` : "";

  return `You are a pi-fm crew member assigned to exactly one task. You are not the supervisor and you never talk to the captain: you report only through the status command and the report file below. Write code, comments and commit messages in English.

# Task ${o.id}

${task}

# Setup

- Project: ${o.project}. You work in an isolated git worktree that is your current working directory.
- Before anything else, run \`pwd -P\` and \`git rev-parse --show-toplevel\`. They must print the same path, and it must not be ${o.projectDir}. If either check fails, run \`${status} failed "not in an isolated worktree"\` and stop.
${ship ? "" : "- This is a scout task: do not commit. Your deliverable is the report.\n"}
# Rules

- Stay inside your worktree. Never touch ${o.projectDir}, other worktrees, ~/.config, or files outside the worktree except your report.
- Heavy work (servers, databases, browsers, end-to-end tests) runs only in Docker: images pinned to an exact tag, compose project name starting with \`pifm-${o.id}\`, published ports bound to 127.0.0.1 and chosen free with \`ss -ltnH "( sport = :PORT )"\`. Remove your containers, networks and volumes before you finish.
- Bound every command with a timeout. Never use \`nohup\`, \`&\` or \`disown\`.
- Never write secrets into files. Never push, open pull requests or merge: the supervisor ships.
- Do not produce JSON reports. Plain text and markdown only.
${include}
# Status protocol

Append exactly one line per event:

    ${status} <verb> [--key <slug>] "<one line>"

- \`working "<step>"\` at the start of each major step.
- \`needs-decision --key <slug> "<question and options>"\` when you need a decision you are not authorised to make. Then wait for the answer: if you have the \`contact_supervisor\` tool, call it with reason \`need_decision\` and the same question; otherwise stop and wait for a steering message. Do not guess.
- \`blocked --key <slug> "<what blocks you>"\` when you cannot continue.
- \`failed "<why>"\` when the task cannot be done.
- \`done "<one-sentence summary>"\` as your very last action.

# Done means

1. Every acceptance criterion in the task is met${o.verify ? ` and \`${o.verify}\` exits 0 from the worktree root` : ""}.
${ship ? "2. All changes are committed in the worktree; `git status --porcelain` prints nothing.\n" : "2. Nothing is committed.\n"}3. ${report} exists: first line is a one-sentence summary, then the sections \`## Changes\`, \`## Verification\` (exact commands and their results) and \`## Risks\`.
4. Your last action is \`${status} done "<summary>"\`.
`;
}

export function writeBrief(o: BriefOptions): string {
  ensureDir(taskDir(o.id));
  const out = join(taskDir(o.id), "brief.md");
  writeFileSync(out, renderBrief(o));
  return out;
}
