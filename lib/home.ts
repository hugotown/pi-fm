// Paths of the pi-fm code root and of the operational home ($PIFM_HOME).
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function homeDir(): string {
  return process.env.PIFM_HOME || join(homedir(), "pi-fm-home");
}

export function paths() {
  const home = homeDir();
  return {
    home,
    config: join(home, "config"),
    data: join(home, "data"),
    state: join(home, "state"),
    projects: join(home, "projects"),
    worktrees: join(home, "worktrees"),
    events: join(home, "state", "events.log"),
  };
}

// Task ids double as directory and branch names; "captain" and "learnings" are memory layers.
export function assertId(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id) || id === "captain" || id === "learnings") {
    throw new Error(`invalid task id: ${JSON.stringify(id)} (lowercase letters, digits, dashes)`);
  }
  return id;
}

export function taskDir(id: string): string {
  return join(paths().data, assertId(id));
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
