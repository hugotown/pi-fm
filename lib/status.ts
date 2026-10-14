// Append-only worker status log, one line per event:
//   <verb>[ key=<slug>] at=<epoch>: <text>
// Workers write it; the watcher reads it. It is the only worker -> supervisor channel.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertId, ensureDir, paths } from "./home.ts";

export const VERBS = ["working", "paused", "note", "done", "failed", "needs-decision", "blocked", "resolved"] as const;
export type Verb = (typeof VERBS)[number];

// Verbs that need the supervisor's attention; the rest are absorbed by the watcher.
export const WAKE_VERBS: ReadonlySet<string> = new Set(["done", "failed", "needs-decision", "blocked"]);

export interface StatusLine {
  verb: Verb;
  key?: string;
  at?: number;
  text: string;
}

const LINE_RE = new RegExp(`^(${VERBS.join("|")})(?: key=([A-Za-z0-9._-]+))?(?: at=(\\d+))?:\\s?(.*)$`);

export function statusFile(id: string): string {
  return join(paths().state, `${assertId(id)}.status`);
}

export function formatStatus(line: StatusLine): string {
  const text = line.text.replace(/\s*\n\s*/g, " ").trim();
  return `${line.verb}${line.key ? ` key=${line.key}` : ""} at=${line.at ?? Math.floor(Date.now() / 1000)}: ${text}`;
}

export function parseStatus(raw: string): StatusLine | null {
  const m = LINE_RE.exec(raw.trim());
  if (!m) return null;
  return { verb: m[1] as Verb, key: m[2], at: m[3] ? Number(m[3]) : undefined, text: m[4] };
}

export function appendStatus(id: string, verb: string, text: string, key?: string): string {
  if (!(VERBS as readonly string[]).includes(verb)) throw new Error(`unknown status verb: ${verb} (one of ${VERBS.join(", ")})`);
  if (key !== undefined && !/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid key: ${key}`);
  ensureDir(paths().state);
  const line = formatStatus({ verb: verb as Verb, key, text });
  appendFileSync(statusFile(id), line + "\n");
  return line;
}

export function readStatus(id: string): StatusLine[] {
  const file = statusFile(id);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map(parseStatus)
    .filter((l): l is StatusLine => l !== null);
}

// Keyed needs-decision/blocked lines stay open until a resolved line with the same key.
export function openDecisions(lines: StatusLine[]): StatusLine[] {
  const open = new Map<string, StatusLine>();
  for (const l of lines) {
    if ((l.verb === "needs-decision" || l.verb === "blocked") && l.key) open.set(l.key, l);
    else if (l.verb === "resolved" && l.key) open.delete(l.key);
  }
  return [...open.values()];
}

export function lastStatus(lines: StatusLine[]): StatusLine | undefined {
  return [...lines].reverse().find((l) => l.verb !== "note");
}
