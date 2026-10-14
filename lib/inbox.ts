// Durable steering inbox: state/<id>.inbox/NNN.md, acknowledged by moving to handled/.
// The terminal only receives a short doorbell naming the file, so long or multi-line
// instructions never depend on terminal input handling.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertId, paths, ROOT } from "./home.ts";

export function inboxDir(id: string): string {
  return join(paths().state, `${assertId(id)}.inbox`);
}

export function writeInbox(id: string, text: string): string {
  const dir = inboxDir(id);
  mkdirSync(join(dir, "handled"), { recursive: true });
  const n = readdirSync(dir).filter((f) => /^\d+\.md$/.test(f)).length + readdirSync(join(dir, "handled")).length + 1;
  const file = join(dir, `${String(n).padStart(3, "0")}.md`);
  writeFileSync(file, text.trim() + "\n");
  return file;
}

export function doorbell(id: string, file: string): string {
  return `Supervisor message waiting: read ${file}, follow it, then run: mv ${file} ${join(inboxDir(id), "handled")}/ (PIFM_HOME=${paths().home} ${ROOT}/bin/pifm status ${id} working "<what you do next>")`;
}

export function unhandled(id: string): string[] {
  const dir = inboxDir(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d+\.md$/.test(f)).map((f) => join(dir, f));
}
