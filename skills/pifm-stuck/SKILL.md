---
name: pifm-stuck
description: Recover a pi-fm crew member that is blocked, failed, silent for too long, waiting at a dialog, or whose handoff did not integrate. Inspect, answer, interrupt, relaunch, and escalate after two failed attempts.
---

# Stuck crew

1. **Look before acting.**
   - Subagent crew: `subagent({ action: "status", id: "<run_id>", view: "transcript", lines: 120 })` (run id from `pifm meta <id>`).
   - Pane crew or fixer: `herdr pane read <pane_id> --source recent --lines 120 --format text`.
   - Always: `pifm log <id>`.
2. **It asked something.** Decide or hold (`/skill:pifm-holds`), then relay the answer.
3. **A pane waits at a dialog** (trust prompt, update prompt, permission prompt). Answer it with `herdr pane send-keys <pane_id> <Key>` only when the safe choice is obvious and saves nothing to the captain's configuration; otherwise hold and ask. Add any new dialog to `config/harnesses.json` so the next launch answers it.
4. **It is working but slow.** Leave it; note the observation with `pifm status <id> note "<what you saw>"`.
5. **It is wedged or failed.**
   - Subagent: `subagent({ action: "interrupt", id })`, then if needed `subagent({ action: "stop", id })`.
   - Pane: `pifm pane close <id>`.
   - Relaunch with `pifm_dispatch` (`rule: "retry"`, `note`: what the previous attempt did, where it stopped, and what to do differently). The new crew starts from `pifm/<id>` if it exists.
6. **Integration failed** (`pifm integrate` error): if the branch moved, relaunch from the branch tip; if the patch does not apply, relaunch with the conflict in the note. Never edit the worktree yourself.
7. **Two failed attempts on the same problem:** `pifm hold <id> "<what failed twice, evidence paths, options>"` and tell the captain. Do not loop.
