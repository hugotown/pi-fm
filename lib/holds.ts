// Captain holds: a decision only the captain can make, parked on a backlog item.
// state/holds/<id>.md records the question; the answer goes verbatim to data/<id>/decisions.md.
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertId, ensureDir, paths, taskDir } from "./home.ts";
import { find, loadBacklog, setHeld } from "./backlog.ts";
import { appendStatus } from "./status.ts";

const holdsDir = () => join(paths().state, "holds");

export interface Hold {
  id: string;
  question: string;
  key?: string;
  since: string;
  until?: string;
}

export function hold(id: string, question: string, opts: { key?: string; until?: string } = {}): Hold {
  assertId(id);
  ensureDir(holdsDir());
  const h: Hold = { id, question: question.trim(), key: opts.key, since: new Date().toISOString(), until: opts.until };
  writeFileSync(
    join(holdsDir(), `${id}.md`),
    `since: ${h.since}\n${h.key ? `key: ${h.key}\n` : ""}${h.until ? `until: ${h.until}\n` : ""}\n${h.question}\n`,
  );
  if (find(loadBacklog(), id)) setHeld(id, h.question.split("\n")[0].slice(0, 120));
  return h;
}

export function listHolds(): Hold[] {
  if (!existsSync(holdsDir())) return [];
  return readdirSync(holdsDir())
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const text = readFileSync(join(holdsDir(), f), "utf8");
      const [head, ...rest] = text.split("\n\n");
      const field = (k: string) => new RegExp(`^${k}: (.*)$`, "m").exec(head)?.[1];
      return { id: f.slice(0, -3), question: rest.join("\n\n").trim(), key: field("key"), since: field("since") ?? "", until: field("until") };
    });
}

// Record the captain's exact words, release the hold, and close the keyed decision if any.
export function answer(id: string, words: string): Hold {
  const h = listHolds().find((x) => x.id === id);
  if (!h) throw new Error(`no open hold for ${id}`);
  ensureDir(taskDir(id));
  appendFileSync(join(taskDir(id), "decisions.md"), `## ${new Date().toISOString()}\n\nQuestion: ${h.question}\n\nCaptain: ${words.trim()}\n\n`);
  rmSync(join(holdsDir(), `${id}.md`));
  if (find(loadBacklog(), id)) setHeld(id, null);
  if (h.key) appendStatus(id, "resolved", `captain answered: ${words.trim().slice(0, 200)}`, h.key);
  return h;
}
