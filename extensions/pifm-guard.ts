// Keeps the supervisor out of project code: it may write only bookkeeping files in its home, and
// git or gh write operations go through `pifm`, which carries the landing proofs.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { blockedCommand, blockedPath, isPrimary } from "../lib/guard.ts";

export default function (pi: ExtensionAPI) {
  if (!isPrimary()) return;
  pi.on("tool_call", async (event, ctx) => {
    let reason: string | null = null;
    if (event.toolName === "write" || event.toolName === "edit") reason = blockedPath(String((event.input as { path?: string }).path ?? ""), ctx.cwd);
    else if (event.toolName === "bash") reason = blockedCommand(String((event.input as { command?: string }).command ?? ""));
    if (reason) return { block: true, reason: `pi-fm guard: ${reason}` };
  });
}
