---
name: pifm-harness
description: How pi-fm runs crew on different harnesses (pi, codex, claude, opencode) and models. Use when choosing or overriding a dispatch rule, when a non-pi crew misbehaves, or when the captain asks for a specific model or harness.
---

# Harnesses and models

- `pifm rules` lists the dispatch rules; `pifm resolve <rule>` shows the candidate that would run now. Candidates whose harness is missing or whose provider is not authenticated are skipped in order.
- Mechanisms:
  - `subagent`: pi crew in a pi-subagents worktree; returns a patch that `pifm integrate` commits.
  - `pane`: any harness in a herdr tab, working directly in the task worktree and committing on `pifm/<id>`.
  - `external`: read-only one-shot runs of codex or claude through pi-subagents, for planning and review only.
- The captain's per-task override wins: put it in the task with `pifm meta <id> rule=<rule>`, or edit `config/dispatch.json` for a lasting change (ask first; it is their routing policy).
- Pane launches answer the startup dialogs listed in `config/harnesses.json`; anything else leaves the pane blocked and wakes you.
- Never infer a provider from a model name, and never silently downgrade to a weaker class: if every candidate is unavailable, tell the captain which logins are missing.
- Your own model can be switched with `switch_model` and the aliases `cheap`, `mid`, `deep` (fallback chains in `.pi/aliases.json`).
