// Crew and fixers that need their own terminal run in a herdr tab: other harnesses (codex, claude,
// opencode) and pi sessions that need a UI (review_loop). Kind-specific launch flags and startup
// dialogs live in config/harnesses.json.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths, ROOT } from "./home.ts";
import { run } from "./exec.ts";
import { readMeta, writeMeta } from "./meta.ts";

export interface HarnessSpec {
  kind: string; // herdr agent kind
  args: string[];
  model?: string[];
  effort?: string[];
  dialogs?: { match: string; keys: string[] }[];
}

export function loadHarnesses(): Record<string, HarnessSpec> {
  const local = join(paths().config, "harnesses.json");
  return JSON.parse(readFileSync(existsSync(local) ? local : join(ROOT, "templates", "config", "harnesses.json"), "utf8"));
}

function herdr(args: string[], timeoutMs = 60_000): { ok: boolean; json: any; raw: string } {
  const res = run("herdr", args, { timeoutMs });
  let json: any = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {}
  return { ok: res.code === 0 && !json?.error, json, raw: res.stdout + res.stderr };
}

const fill = (parts: string[] | undefined, vars: Record<string, string>) =>
  (parts ?? []).map((p) => p.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ""));

export function agentName(id: string): string {
  return `pifm-${id}`.slice(0, 32);
}

export function readScreen(target: string, lines = 40): string {
  const res = run("herdr", ["pane", "read", target, "--source", "visible", "--lines", String(lines), "--format", "text"], { timeoutMs: 15_000 });
  return res.stdout;
}

// Answer known startup dialogs until the agent is ready; unknown dialogs stay blocked for the supervisor.
function settleStartup(target: string, spec: HarnessSpec, deadline: number): string {
  while (Date.now() < deadline) {
    const state = herdr(["agent", "get", target]).json?.result?.agent?.agent_status ?? "unknown";
    if (state === "idle" || state === "done") return state;
    const screen = readScreen(target);
    const dialog = spec.dialogs?.find((d) => screen.includes(d.match));
    if (dialog) {
      for (const key of dialog.keys) {
        if (/^[A-Z][A-Za-z]+$/.test(key)) run("herdr", ["pane", "send-keys", target, key], { timeoutMs: 10_000 });
        else run("herdr", ["pane", "send-text", target, key], { timeoutMs: 10_000 });
      }
    }
    run("herdr", ["agent", "wait", target, "--until", "idle", "--until", "blocked", "--timeout", "5000"], { timeoutMs: 10_000 });
  }
  return herdr(["agent", "get", target]).json?.result?.agent?.agent_status ?? "unknown";
}

export interface PaneLaunch {
  id: string;
  harness: string;
  model?: string;
  effort?: string;
  cwd: string;
  prompt: string;
  label?: string;
}

export function startPane(o: PaneLaunch): { pane: string; tab: string; state: string } {
  if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_WORKSPACE_ID) throw new Error("pane crew needs the supervisor to run inside a herdr pane");
  const spec = loadHarnesses()[o.harness];
  if (!spec) throw new Error(`no harness spec for ${o.harness} in harnesses.json`);
  const tab = herdr(["tab", "create", "--workspace", process.env.HERDR_WORKSPACE_ID, "--cwd", o.cwd, "--label", o.label ?? `pifm ${o.id}`, "--no-focus"]);
  if (!tab.ok) throw new Error(`herdr tab create failed: ${tab.raw}`);
  const tabId: string = tab.json.result.tab.tab_id;
  const pane: string = tab.json.result.root_pane.pane_id;
  writeMeta(o.id, { mechanism: "pane", harness: o.harness, tab_id: tabId, pane_id: pane, agent: agentName(o.id) });
  const vars = { cwd: o.cwd, model: o.model ?? "", effort: o.effort ?? "" };
  const argv = [...fill(spec.args, vars), ...(o.model ? fill(spec.model, vars) : []), ...(o.effort ? fill(spec.effort, vars) : [])];
  herdr(["agent", "start", agentName(o.id), "--kind", spec.kind, "--pane", pane, "--timeout", "60000", "--", ...argv], 90_000);
  const state = settleStartup(pane, spec, Date.now() + 120_000);
  if (state !== "idle" && state !== "done") return { pane, tab: tabId, state };
  const sent = herdr(["agent", "prompt", pane, o.prompt], 30_000);
  if (!sent.ok) throw new Error(`could not deliver the prompt to ${pane}: ${sent.raw}`);
  return { pane, tab: tabId, state: "working" };
}

export function paneState(id: string): string {
  const meta = readMeta(id);
  if (!meta.pane_id) return "none";
  const res = herdr(["agent", "get", meta.pane_id], 15_000);
  if (!res.ok) return "gone";
  return res.json.result.agent.agent_status ?? "unknown";
}

export function promptPane(id: string, text: string): void {
  const meta = readMeta(id);
  if (!meta.pane_id) throw new Error(`${id} has no pane`);
  const res = herdr(["agent", "prompt", meta.pane_id, text], 30_000);
  if (!res.ok) throw new Error(`herdr agent prompt failed: ${res.raw}`);
}

export function closePane(id: string): void {
  const meta = readMeta(id);
  if (meta.tab_id) herdr(["tab", "close", meta.tab_id], 15_000);
  writeMeta(id, { tab_id: "", pane_id: "", agent: "" });
}
