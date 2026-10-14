// Bounded process execution: every call has a timeout and returns its exit code.
import { spawnSync } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; input?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    env: opts.env ?? process.env,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 60_000,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });
  const timedOut = res.error && (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  return {
    code: timedOut ? 124 : res.status ?? (res.error ? 127 : 1),
    stdout: res.stdout ?? "",
    stderr: (res.stderr ?? "") + (res.error && !timedOut ? String(res.error) : timedOut ? "\ntimed out" : ""),
  };
}

export function mustRun(cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}): string {
  const res = run(cmd, args, opts);
  if (res.code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${res.code}): ${res.stderr.trim() || res.stdout.trim()}`);
  }
  return res.stdout;
}

export function git(cwd: string, args: string[], timeoutMs = 120_000): string {
  return mustRun("git", args, { cwd, timeoutMs }).trim();
}

export function hasCommand(name: string): boolean {
  return run("bash", ["-c", `command -v ${name}`], { timeoutMs: 5_000 }).code === 0;
}
