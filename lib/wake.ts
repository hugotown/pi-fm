// Durable wake queue: state/.wake-queue holds one TSV row per actionable event,
//   <epoch>\t<seq>\t<kind>\t<key>\t<payload>
// state/.wake-acked holds the highest seq the supervisor has handled.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, paths } from "./home.ts";

export type WakeKind = "signal" | "stale" | "check" | "heartbeat";

export interface Wake {
  epoch: number;
  seq: number;
  kind: WakeKind;
  key: string;
  payload: string;
}

const queueFile = () => join(paths().state, ".wake-queue");
const ackFile = () => join(paths().state, ".wake-acked");

export function readQueue(): Wake[] {
  if (!existsSync(queueFile())) return [];
  return readFileSync(queueFile(), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [epoch, seq, kind, key, ...rest] = row.split("\t");
      return { epoch: Number(epoch), seq: Number(seq), kind: kind as WakeKind, key, payload: rest.join("\t") };
    });
}

export function ackedThrough(): number {
  return existsSync(ackFile()) ? Number(readFileSync(ackFile(), "utf8").trim() || 0) : 0;
}

export function pending(): Wake[] {
  const acked = ackedThrough();
  return readQueue().filter((w) => w.seq > acked);
}

// Enqueue unless an unhandled row with the same key already waits (one wake per open condition).
export function enqueue(kind: WakeKind, key: string, payload: string): Wake | null {
  if (pending().some((w) => w.key === key)) return null;
  ensureDir(paths().state);
  const rows = readQueue();
  const seq = (rows.length ? rows[rows.length - 1].seq : ackedThrough()) + 1;
  const wake: Wake = { epoch: Math.floor(Date.now() / 1000), seq, kind, key, payload: payload.replace(/[\t\n]+/g, " ") };
  appendFileSync(queueFile(), `${wake.epoch}\t${wake.seq}\t${wake.kind}\t${wake.key}\t${wake.payload}\n`);
  return wake;
}

// Acknowledge through a seq and compact the handled rows away.
export function ack(through: number): number {
  const keep = readQueue().filter((w) => w.seq > through);
  ensureDir(paths().state);
  writeFileSync(ackFile(), String(Math.max(through, ackedThrough())) + "\n");
  writeFileSync(queueFile(), keep.map((w) => `${w.epoch}\t${w.seq}\t${w.kind}\t${w.key}\t${w.payload}\n`).join(""));
  return keep.length;
}

export function formatWakes(wakes: Wake[]): string {
  return wakes.map((w) => `#${w.seq} ${w.kind} ${w.key}: ${w.payload}`).join("\n");
}
