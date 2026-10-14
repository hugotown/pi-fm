// Per-task runtime facts in state/<id>.meta as key=value lines (mechanism, branch, worktree, pr, ...).
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertId, ensureDir, paths } from "./home.ts";

export type Meta = Record<string, string>;

export function metaFile(id: string): string {
  return join(paths().state, `${assertId(id)}.meta`);
}

export function readMeta(id: string): Meta {
  const file = metaFile(id);
  if (!existsSync(file)) return {};
  const meta: Meta = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) meta[line.slice(0, i)] = line.slice(i + 1);
  }
  return meta;
}

export function writeMeta(id: string, updates: Meta): Meta {
  ensureDir(paths().state);
  const meta = { ...readMeta(id), ...updates };
  for (const [k, v] of Object.entries(updates)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error(`invalid meta key: ${k}`);
    if (v.includes("\n")) throw new Error(`meta value for ${k} must be one line`);
    if (v === "") delete meta[k];
  }
  const file = metaFile(id);
  const body = Object.entries(meta).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(file + ".tmp", body);
  renameSync(file + ".tmp", file);
  return meta;
}

// Task ids that currently have runtime state (in flight or not yet torn down).
export function liveTaskIds(): string[] {
  const dir = paths().state;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".meta"))
    .map((f) => f.slice(0, -".meta".length))
    .sort();
}
