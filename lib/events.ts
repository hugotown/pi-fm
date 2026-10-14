// state/events.log: one line per lifecycle event, for humans and outside drivers to tail.
//   <iso-time> PIFM_<KIND> <text>
import { appendFileSync } from "node:fs";
import { ensureDir, paths } from "./home.ts";

export function logEvent(kind: string, text: string): string {
  const line = `${new Date().toISOString()} PIFM_${kind.toUpperCase()} ${text.replace(/\s*\n\s*/g, " ")}`;
  ensureDir(paths().state);
  appendFileSync(paths().events, line + "\n");
  return line;
}
