---
name: pifm-task
description: Build, Verify, Review and Ship queued pi-fm tasks until the epic is merged. Covers dispatch, integration, verification, review rounds with fixes, pull requests, merge and teardown, and how to handle each watcher wake.
---

# Build → Verify → Review → Ship

Call `pifm_phase` with `action: "start"`, `label: "build:<epic>"` once, before the first dispatch. End it only when every task of the epic is merged and torn down.

## Dispatch

A task is ready when it is in `## Queued` and every id in its `depends` meta is in `## Done`. Dispatch every ready task (there is no concurrency cap; serialize only real dependencies):

- `pifm_dispatch` with `id` (the rule comes from the task's meta).

Then end your turn. The watcher wakes you; never poll in a loop.

## Wakes and what to do

| Wake row | Action |
|---|---|
| `<id> done` (subagent crew) | `pifm integrate <id>`, then Verify. If integrate fails, see `/skill:pifm-stuck`. |
| `<id> done` (pane crew or fixer) | `pifm pane close <id>`, then Verify. |
| `<id> needs-decision key=<k>` | Decide per AGENTS.md "Deciding versus asking". To answer a subagent crew waiting on `contact_supervisor`: `subagent_supervisor({ action: "pending" })` then `subagent_supervisor({ action: "reply", replyTo, message })`; to answer a pane crew: `pifm send <id> "<answer>"`. Then `pifm status <id> resolved --key <k> "<answer>"`. Captain-owned: `/skill:pifm-holds`. |
| `<id> blocked`, `<id> failed`, stale, pane blocked or gone | `/skill:pifm-stuck` |
| `<id> PR ... is green` | Ship step 3. |
| `<id> PR ... is red` | Ship step 4. |
| `<id> PR ... is merged` | `pifm teardown <id>`, then dispatch newly ready tasks. |
| heartbeat | `pifm inflight`; act on anything that looks wrong; otherwise just acknowledge. |

Always finish with the `pifm ack <seq>` the wake asks for.

## Verify

1. `pifm verify <id>` rebases onto the default branch and runs the task's verify command. On FAIL, read the log tail it prints.
2. When the task has user-visible behaviour, also run `pifm_consult` with `rule: "build-bounded"`, `agent: "pifm-verifier"`, `cwd: <task worktree from pifm meta <id>>`, `output: "<id>/verify.md"`, asking it to check the task's criteria from `data/<id>/task.md` end to end. The last line must be `Verdict: PASS`.
3. On any failure, relaunch the crew with the evidence: `pifm_dispatch` with `id`, `rule: "retry"`, and `note: "Verification failed: <one line>. Read <log path>. Fix it on top of the existing commits."`. After two failed attempts, `/skill:pifm-stuck`.

## Review (replaces an external gate; at most 3 rounds)

1. `pifm_review` with `id` and `round` (1, then 2, 3). It writes `data/<id>/review/round-<n>/verdict.md`.
2. Outcome `clean`: Ship.
3. Outcome `ask-user`: `/skill:pifm-holds` with the findings listed under "Ask the captain"; once answered, continue with a fix round that includes the answer.
4. Outcome `fix`: start a fixer in a pane with review_loop:
   - `pifm meta <id> stage=fixing`
   - `pifm resolve fix` gives the model and effort; then `pifm pane start <id> --harness pi --model <model> --effort <effort> --cwd <task worktree> --prompt "<fix prompt>"`, where the fix prompt says: "You are fixing review findings on this branch. Read <verdict.md path>, and <home>/data/<id>/decisions.md if it exists. Fix every item under 'Fix now', run <verify command>, and commit. Then call the review_loop tool with {\"start\": true, \"maxIterations\": 3, \"focus\": \"the fixes for <verdict.md path>\"} and follow it, committing any further fixes. When review mode has ended, run: PIFM_HOME=<home> pifm status <id> done \"fixed round <n>\"."
   - On its `done` wake: `pifm pane close <id>`, `pifm verify <id>`, then the next review round.
5. After round 3 without `clean`: `pifm hold <id>` with the remaining findings and tell the captain.

## Ship

1. `pifm ship <id>` pushes `pifm/<id>` and opens the pull request; `pifm meta` records the PR and the reviewed head.
2. Tell the captain in one line: the full PR URL and what it does.
3. Green wake: if the project is `+yolo` (`pifm project list`) or the captain approved this PR, `pifm merge <id>`. Otherwise `pifm hold <id> "Merge <PR URL>?"` and ask.
4. Red wake: `gh pr checks <pr>` and `gh run view <run-id> --log-failed` to read the failure; write it to `data/<id>/ci-failure.md`; relaunch with `pifm_dispatch` (`rule: "retry"`, `note` pointing at that file); then `pifm verify`, a new review round, and `pifm ship <id>` again.
5. Merged wake: `pifm teardown <id>`.

When the epic's last task is torn down: `pifm event epic "<epic> merged"`, tell the captain what shipped (every PR URL) and how to try it, then call `pifm_phase` with `action: "end"`, `label: "build:<epic>"`.
