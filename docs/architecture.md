# Architecture

## Processes

```
captain ──chat/forms──▶ supervisor (interactive pi in a herdr pane, cwd = $PIFM_HOME)
                          │  extensions: pifm-primary (watcher, phases, tools), pifm-guard, pifm-surfaces
                          │  plugins:    pi-subagents, pi-interview, pi-design-deck, pi-intercom, pi-rewind-hook, ...
                          ├─ pifm_dispatch ─▶ pi-subagents background run in a worktree (pi crew) ──▶ patch + handoff
                          ├─ pifm_dispatch ─▶ herdr tab running codex / claude / opencode / pi (pane crew) ──▶ commits on pifm/<id>
                          ├─ pifm_review ───▶ pi-subagents workflow: 3 fresh reviewers (pi or external claude-code/codex-exec)
                          ├─ pifm_consult ──▶ planner / verifier / scout, output saved to data/
                          └─ bash: pifm ... (integrate, verify, ship, merge, teardown, holds, backlog)
crew ──status lines──▶ state/<id>.status ──watcher──▶ state/.wake-queue ──PIFM_WAKE message──▶ supervisor
```

The supervisor never edits project code; `pifm-guard` blocks writes outside its home and git or gh write commands. Every state change goes through the `pifm` CLI, which shares `lib/` with the extensions.

## Handoffs are plain text

| From → to | Carrier |
|---|---|
| supervisor → crew | `data/<id>/brief.md` (markdown), steering via `state/<id>.inbox/NNN.md` + doorbell, or `subagent` steer |
| crew → supervisor | one-line status entries `<verb>[ key=<k>] at=<epoch>: <text>`, and `data/<id>/report.md` |
| reviewers → supervisor | prose with `Finding:` and `Merge verdict:` lines, grepped by `pifm triage` |
| planner, verifier, scout → supervisor | a markdown document saved by `pifm_consult` |

No agent is asked for JSON. pi-subagents launches carry `acceptance: {level: "none"}` so no acceptance-report block is requested.

## Phases and context

`pifm_phase start|end` brackets each phase. At `end`, after the run settles, the extension runs its own `/pifm-collapse` command, which calls `navigateTree(anchor, { summarize: true })` and continues the flow with `PIFM_PHASE_DONE`. pi-boomerang 0.7.0 does the same collapse inside `agent_end`, which pi 1.1.0 rejects ("Wait for the current response to finish"), so pi-fm does it at `agent_settled`; it reuses boomerang's `__boomerangCollapseInProgress` flag so pi-rewind-hook does not prompt.

## Watcher

Inside the supervisor process, no model tokens:

- every 5 s: new status lines → wakes (`done` of a subagent run waits until its handoff manifest exists);
- every 60 s: PR state for shipping tasks (green, red, merged, closed), pane state (blocked, gone), staleness (25 min without a status line), heartbeat (20 min with work in flight);
- delivery: pending wakes go out as one `PIFM_WAKE` user message when the session is idle, are re-sent after 10 min unacknowledged, and are acknowledged with `pifm ack <seq>`. Away and quiet modes absorb heartbeats.

## Review gate (in place of an external pipeline)

`pifm verify` (clean tree, rebase onto the default branch, task verify command) → optional end-to-end verifier → `pifm_review` round (intent, tests, simplicity/security reviewers in parallel) → `pifm triage` outcome `clean | fix | ask-user` → fixer pane with `review_loop` → next round, at most three → `pifm ship` → watcher sees green → `pifm merge` (`gh pr merge --match-head-commit <reviewed head>`) → `pifm teardown` (refuses unless landed).

## Model routing

`config/dispatch.json` keeps the captain's routing policy as named rules (`when`, ordered `use` candidates, `why`). `pifm resolve <rule>` returns the first candidate whose harness is installed and whose provider is authenticated (`pi auth check`, `codex login status`, `claude auth status`, `opencode models`), cached for ten minutes.

## Files

See the table in `templates/home/AGENTS.md`; formats are documented at the top of each `lib/` module.
