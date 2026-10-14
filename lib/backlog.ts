// data/backlog.md: the durable work queue, kept in firstmate's markdown grammar.
//   ## In flight / ## Queued / ## Done
//   - [ ] <id> - <title> (project: p) (kind: ship|scout) [(epic: e)] [(held: reason)]
//   - [x] <id> - <title> ... (done YYYY-MM-DD: note)
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertId, ensureDir, paths } from "./home.ts";

export const SECTIONS = ["In flight", "Queued", "Done"] as const;
export type Section = (typeof SECTIONS)[number];
const DONE_KEEP = 20;

export interface Item {
  id: string;
  done: boolean;
  line: string; // the "- [ ] ..." line without the checkbox prefix
  body: string[]; // indented continuation lines
}

export type Backlog = Record<Section, Item[]>;

export function backlogFile(): string {
  return join(paths().data, "backlog.md");
}

export function parseBacklog(text: string): Backlog {
  const out: Backlog = { "In flight": [], Queued: [], Done: [] };
  let section: Section | null = null;
  for (const raw of text.split("\n")) {
    const h = /^## (.+?)\s*$/.exec(raw);
    if (h) {
      section = (SECTIONS as readonly string[]).includes(h[1]) ? (h[1] as Section) : null;
      continue;
    }
    if (!section) continue;
    const m = /^- \[( |x)\] (\S+) - (.*)$/.exec(raw);
    if (m) out[section].push({ id: m[2], done: m[1] === "x", line: `${m[2]} - ${m[3]}`, body: [] });
    else if (/^\s+\S/.test(raw) && out[section].length) out[section][out[section].length - 1].body.push(raw);
  }
  return out;
}

export function renderBacklog(b: Backlog): string {
  const parts = ["# Backlog", ""];
  for (const s of SECTIONS) {
    parts.push(`## ${s}`, "");
    for (const it of b[s]) parts.push(`- [${it.done ? "x" : " "}] ${it.line}`, ...it.body);
    if (b[s].length) parts.push("");
  }
  return parts.join("\n").replace(/\n+$/, "\n");
}

export function loadBacklog(): Backlog {
  const file = backlogFile();
  return parseBacklog(existsSync(file) ? readFileSync(file, "utf8") : "");
}

export function saveBacklog(b: Backlog): void {
  ensureDir(paths().data);
  const file = backlogFile();
  writeFileSync(file + ".tmp", renderBacklog(b));
  renameSync(file + ".tmp", file);
}

export function find(b: Backlog, id: string): { section: Section; index: number; item: Item } | null {
  for (const section of SECTIONS) {
    const index = b[section].findIndex((it) => it.id === id);
    if (index >= 0) return { section, index, item: b[section][index] };
  }
  return null;
}

function mustFind(b: Backlog, id: string) {
  const hit = find(b, id);
  if (!hit) throw new Error(`backlog has no item ${id}`);
  return hit;
}

export function addItem(
  id: string,
  title: string,
  opts: { project: string; kind?: "ship" | "scout"; epic?: string; note?: string },
): Item {
  assertId(id);
  const b = loadBacklog();
  if (find(b, id)) throw new Error(`backlog already has ${id}`);
  const tags = [`(project: ${opts.project})`, `(kind: ${opts.kind ?? "ship"})`];
  if (opts.epic) tags.push(`(epic: ${opts.epic})`);
  const item: Item = { id, done: false, line: `${id} - ${title.trim()} ${tags.join(" ")}`, body: [] };
  if (opts.note) item.body.push(...opts.note.split("\n").map((l) => `  ${l}`));
  b.Queued.push(item);
  saveBacklog(b);
  return item;
}

function move(b: Backlog, id: string, to: Section): Item {
  const hit = mustFind(b, id);
  b[hit.section].splice(hit.index, 1);
  if (to === "Done") b.Done.unshift(hit.item);
  else b[to].push(hit.item);
  return hit.item;
}

export function startItem(id: string): Item {
  const b = loadBacklog();
  const hit = mustFind(b, id);
  if (hit.section === "Done") throw new Error(`${id} is already done`);
  if (/\(held: /.test(hit.item.line)) throw new Error(`${id} is held for the captain; answer the hold first`);
  const item = hit.section === "In flight" ? hit.item : move(b, id, "In flight");
  saveBacklog(b);
  return item;
}

export function completeItem(id: string, note: string): Item {
  const b = loadBacklog();
  const item = move(b, id, "Done");
  item.done = true;
  item.line = `${item.line.replace(/ \(held: [^)]*\)/, "")} (done ${new Date().toISOString().slice(0, 10)}: ${note.trim()})`;
  // Keep Done short; the overflow goes to the archive.
  const overflow = b.Done.splice(DONE_KEEP);
  if (overflow.length) {
    appendFileSync(join(paths().data, "done-archive.md"), renderBacklog({ "In flight": [], Queued: [], Done: overflow }).replace(/^# Backlog\n\n## Done\n\n/, ""));
  }
  saveBacklog(b);
  return item;
}

export function setHeld(id: string, reason: string | null): Item {
  const b = loadBacklog();
  const { item } = mustFind(b, id);
  item.line = item.line.replace(/ \(held: [^)]*\)/, "");
  if (reason) item.line += ` (held: ${reason.replace(/[()]/g, "")})`;
  saveBacklog(b);
  return item;
}

export function tagValue(item: Item, tag: string): string | undefined {
  return new RegExp(`\\(${tag}: ([^)]*)\\)`).exec(item.line)?.[1];
}
