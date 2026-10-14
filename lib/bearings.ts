// A four-part snapshot for /bearings: Captain's call, Recently landed, Underway, Charted next.
import { loadBacklog } from "./backlog.ts";
import { listHolds } from "./holds.ts";
import { liveTaskIds, readMeta } from "./meta.ts";
import { lastStatus, openDecisions, readStatus } from "./status.ts";
import { pending } from "./wake.ts";

export function bearings(): string {
  const b = loadBacklog();
  const call: string[] = listHolds().map((h) => `- ${h.id}: ${h.question.split("\n")[0]}`);
  for (const id of liveTaskIds()) {
    for (const d of openDecisions(readStatus(id))) if (!call.some((c) => c.startsWith(`- ${id}:`))) call.push(`- ${id} (${d.verb} ${d.key}): ${d.text}`);
  }
  const underway = b["In flight"].map((it) => {
    const m = readMeta(it.id);
    const s = lastStatus(readStatus(it.id));
    return `- ${it.line}\n  stage: ${m.stage ?? "-"}${m.pr ? `, PR ${m.pr}` : ""}${s ? `, last: ${s.verb}: ${s.text}` : ""}`;
  });
  const section = (title: string, rows: string[]) => `## ${title}\n\n${rows.join("\n") || "- nothing"}\n`;
  return [
    section("Captain's call", call),
    section("Recently landed", b.Done.slice(0, 5).map((it) => `- ${it.line}`)),
    section("Underway", underway),
    section("Charted next", b.Queued.map((it) => `- ${it.line}`)),
    `Pending wakes: ${pending().length}`,
  ].join("\n");
}
