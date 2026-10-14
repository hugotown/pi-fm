// Model/harness routing in the spirit of firstmate's crew-dispatch.json:
// named rules map a kind of work to an ordered list of candidates; the first candidate whose
// harness is installed and whose provider is authenticated wins.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, paths, ROOT } from "./home.ts";
import { hasCommand, run } from "./exec.ts";

export interface Candidate {
  harness: string; // pi | codex | claude | opencode
  model?: string; // pi: provider/model; others: their own model id
  effort?: string; // low | medium | high | xhigh
  // subagent: pi-subagents child in a worktree; pane: herdr tab; external: pi-subagents
  // claude-code / codex-exec one-shot runner, for read-only roles (plan, review).
  mechanism?: "subagent" | "pane" | "external";
}

export interface Rule {
  name: string;
  when: string;
  use: Candidate[];
  why?: string;
}

export interface Table {
  rules: Rule[];
  default: Candidate[];
}

export interface Resolution {
  rule: string;
  profile: Required<Pick<Candidate, "harness" | "mechanism">> & Candidate;
  skipped: string[];
}

export function loadTable(): Table {
  const local = join(paths().config, "dispatch.json");
  const file = existsSync(local) ? local : join(ROOT, "templates", "config", "dispatch.json");
  const table = JSON.parse(readFileSync(file, "utf8")) as Table;
  if (!Array.isArray(table.rules) || !Array.isArray(table.default)) throw new Error(`${file}: needs "rules" and "default" arrays`);
  return table;
}

const AUTH_TTL_S = 600;

function cachedAuth(key: string, probe: () => boolean): boolean {
  const file = join(paths().state, ".auth-cache");
  const now = Math.floor(Date.now() / 1000);
  let cache: Record<string, [number, boolean]> = {};
  try {
    cache = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const hit = cache[key];
  if (hit && now - hit[0] < AUTH_TTL_S) return hit[1];
  const ok = probe();
  cache[key] = [now, ok];
  ensureDir(paths().state);
  writeFileSync(file, JSON.stringify(cache));
  return ok;
}

// Returns null when the candidate is usable, or the reason it is not.
export function unavailable(c: Candidate): string | null {
  if (!hasCommand(c.harness)) return `${c.harness} is not installed`;
  if (c.mechanism === "external" && c.harness !== "codex" && c.harness !== "claude") return `external runners exist only for codex and claude`;
  if (c.mechanism === "subagent" && c.harness !== "pi") return `subagent crew must use harness pi`;
  if (c.harness === "pi") {
    const provider = c.model?.split("/")[0];
    if (!provider || !c.model?.includes("/")) return `pi candidates need model "provider/id", got ${c.model}`;
    const ok = cachedAuth(`pi:${provider}`, () => run("pi", ["auth", "check", "--provider", provider, "--no-refresh"], { timeoutMs: 30_000 }).code === 0);
    return ok ? null : `pi provider ${provider} is not authenticated`;
  }
  if (c.harness === "codex") {
    return cachedAuth("codex", () => run("codex", ["login", "status"], { timeoutMs: 30_000 }).code === 0) ? null : "codex is not logged in";
  }
  if (c.harness === "opencode") {
    if (!c.model) return "opencode candidates need a model";
    const listed = cachedAuth(`opencode:${c.model}`, () =>
      run("opencode", ["models"], { timeoutMs: 60_000 }).stdout.split("\n").some((l) => l.trim() === c.model),
    );
    return listed ? null : `opencode does not offer ${c.model} (provider not authenticated)`;
  }
  if (c.harness === "claude") {
    return cachedAuth("claude", () => run("claude", ["auth", "status"], { timeoutMs: 30_000 }).code === 0) ? null : "claude is not logged in";
  }
  return null;
}

export function resolve(ruleName?: string): Resolution {
  const table = loadTable();
  const rule = ruleName ? table.rules.find((r) => r.name === ruleName) : undefined;
  if (ruleName && !rule) throw new Error(`no dispatch rule named ${ruleName}; rules: ${table.rules.map((r) => r.name).join(", ")}`);
  const skipped: string[] = [];
  for (const c of [...(rule?.use ?? []), ...table.default]) {
    const why = unavailable(c);
    if (why) {
      skipped.push(`${c.harness}${c.model ? ` ${c.model}` : ""}: ${why}`);
      continue;
    }
    const mechanism = c.mechanism ?? (c.harness === "pi" ? "subagent" : "pane");
    return { rule: rule?.name ?? "default", profile: { ...c, mechanism }, skipped };
  }
  throw new Error(`no usable candidate for rule ${ruleName ?? "default"}:\n${skipped.join("\n")}`);
}

export function formatProfile(r: Resolution): string {
  const p = r.profile;
  return `profile: rule=${r.rule} harness=${p.harness} model=${p.model ?? "default"} effort=${p.effort ?? "default"} mechanism=${p.mechanism}`;
}
