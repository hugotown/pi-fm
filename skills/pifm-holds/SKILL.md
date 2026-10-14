---
name: pifm-holds
description: Captain decisions in pi-fm. Decide what you may decide, park the rest as holds, ask the captain with an interview form, and relay the answer to the crew. Use for needs-decision and ask-user findings, merge approvals, and any scope, cost, security or destructive choice.
---

# Holds

## Decide or ask

You decide when the answer follows unambiguously from the captain's words in `spec.md`, `task.md` or `decisions.md`, and it does not widen scope. Record it with `pifm status <id> resolved --key <k> "<answer and reason>"` and relay it.

You ask the captain when the choice changes scope, product behaviour, cost, security or data, merges without `+yolo`, or is destructive or irreversible. A crew member never decides these, and neither do reviewers.

## Ask

1. `pifm hold <id> "<question, the options, and your recommendation>" --key <k>` (use the status key when there is one).
2. If `pifm afk show` says away: stop here. The hold waits; keep other work moving.
3. Otherwise ask with `interview`: an `info` block with the context, then one `single` question whose options are the choices (your recommendation first, marked "recommended") plus a `text` field for anything else. `timeout: 1800`.
4. `pifm answer <id> "<the captain's exact words>"`. This appends to `data/<id>/decisions.md`, releases the hold and closes the keyed decision.
5. Relay: subagent crew waiting on `contact_supervisor` gets `subagent_supervisor({ action: "reply", replyTo, message })`; pane crew gets `pifm send <id> "<answer>"`; a review finding becomes part of the next fix prompt.

`pifm holds` lists everything waiting on the captain.
