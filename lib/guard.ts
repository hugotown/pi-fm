// Pure rules shared by the supervisor extensions (and their tests).
import { isAbsolute, join, resolve } from "node:path";
import { paths } from "./home.ts";

// The supervisor session: launched by bin/pi-fm, and not a pi-subagents child that inherited its env.
export const isPrimary = () => process.env.PIFM_ROLE === "primary" && !process.env.PI_SUBAGENT_CHILD;

const GIT_WRITE = /\bgit\b(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+(commit|push|merge|rebase|reset|cherry-pick|revert|am|apply|checkout|switch|restore|stash|clean|worktree|branch\s+-[dDmM]|tag)\b/;
const GH_WRITE = /\bgh\s+(pr\s+(create|merge|close|edit|ready)|repo\s+(create|delete|edit))\b/;

// The supervisor may write bookkeeping in its home, never project clones or worktrees.
export function blockedPath(file: string, cwd: string): string | null {
  const p = paths();
  const abs = resolve(isAbsolute(file) ? file : join(cwd, file));
  const inside = (dir: string) => abs === dir || abs.startsWith(dir + "/");
  if (!inside(p.home)) return `${abs} is outside the pi-fm home; project code is written by crew, not the supervisor`;
  if (inside(p.projects) || inside(p.worktrees)) return `${abs} is project code; dispatch a crew member instead`;
  return null;
}

// git and gh write operations go through pifm, which carries the landing proofs.
export function blockedCommand(command: string): string | null {
  if (GIT_WRITE.test(command)) return "git write operations go through pifm (integrate, verify, ship, merge, teardown)";
  if (GH_WRITE.test(command)) return "pull request changes go through pifm ship and pifm merge";
  const p = paths();
  if (/\b(rm|mv|cp|sed\s+-i|truncate)\b/.test(command) && (command.includes(p.projects) || command.includes(p.worktrees) || /(^|\s)(projects|worktrees)\//.test(command))) {
    return "the supervisor never changes files in project clones or worktrees";
  }
  return null;
}

// pi-interview and pi-design-deck validate the session token on every route except a tokenless
// GET /, which they answer for loopback peers (a proxy is one) with a page embedding the token.
export function proxyAllowed(reqUrl: string, token: string): boolean {
  const u = new URL(reqUrl, "http://proxy");
  return u.pathname !== "/" || u.searchParams.get("session") === token;
}
