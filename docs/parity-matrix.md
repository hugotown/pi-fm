# Parity with firstmate

Source: firstmate `70f2ed3d` (2026-10-05), its feature checklist of 164 capabilities. Scope agreed with the captain: functional parity with pi and herdr fixed; other harness adapters run through herdr panes; other terminal backends are out by design; Relay, mail, voice and remote secondmates are deferred.

Legend: **Yes** covered · **Plugin** provided by a pi extension · **Partial** covered in a simpler form (note says what is missing) · **N/A** does not apply with pi + herdr fixed · **Deferred** agreed for a later phase · **No** not ported yet.

## Summary

| Status | Count |
|---|---|
| Yes | 76 |
| Plugin | 8 |
| Partial | 32 |
| N/A | 29 |
| Deferred | 16 |
| No | 3 |

## Core identity and rules

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 1 | Single-liaison supervisor persona, captain address, outcome language | Yes | `templates/home/AGENTS.md` |
| 2 | Five hard rules | Yes | persona rules 1-6; `pifm-guard`; proofs in `lib/ship.ts` |
| 3 | Captain-instruction precedence | Yes | persona rule 8 |
| 4 | Worker role contract overlay | Yes | `lib/brief.ts` opening, `agents/pifm-crew.md` |
| 5 | Internal-term translation for captain text | Partial | persona rule 4 (relay in own words); no term table |

## Home, layout, locks

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 6 | Operational home separate from code root | Partial | `$PIFM_HOME`; no per-directory overrides |
| 7 | Per-home session lock, second session read-only | Yes | `state/.lock` in `pifm-primary` |
| 8 | Private data, state, config, projects | Yes | home lives outside the repo |
| 9 | State-file taxonomy | Yes | `templates/home/AGENTS.md`, module headers in `lib/` |

## Session start and recovery

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 10 | Ordered session-start digest | Yes | `PIFM_SESSION_START` + persona steps + `pifm bearings` |
| 11 | Re-emit after /clear or compaction | Partial | pi reloads AGENTS.md; no explicit re-emit |
| 12 | Per-harness session-open adapters | N/A | supervisor is always pi |
| 13 | Deferred network stage | Partial | `pifm doctor` on demand |
| 14 | Toolchain detection with consented install | Partial | `pifm doctor` detects; installs stay manual per host rules |
| 15 | Bootstrap diagnostics vocabulary | Partial | `pifm doctor` ok/FAIL lines |
| 16 | Read-once contract | N/A | pi loads context files itself |
| 17 | Interrupted backlog-close replay | Partial | teardown re-runnable; no replay marker |
| 18 | Dead worker recovery ladder | Yes | `skills/pifm-stuck` |

## Projects

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 19 | Project registry with mode and yolo | Yes | `lib/projects.ts` (`pr`/`local`, `+yolo`) |
| 20 | Project add, clone, create, remove | Partial | add, list, sync; create asks the captain; no remove command |
| 21 | Production-only gate policy | N/A | no external gate |
| 22 | Forge detection | Partial | GitHub; GitLab and Gerrit deferred |
| 23 | Guarded clone refresh | Yes | `syncProject` (ff-only, refuses dirty) |
| 24 | Project AGENTS.md init | No | crew read whatever the project has |

## Backlog

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 25 | Markdown backlog | Yes | `lib/backlog.ts`, firstmate grammar |
| 26 | Wrapper refusals | Yes | id validation, duplicate and held refusals |
| 27 | Automatic dispatch/completion transitions | Yes | `pifm_dispatch` starts, `pifm teardown` completes |
| 28 | Manual backlog mode | N/A | |
| 29 | Captain holds | Yes | `lib/holds.ts`, `skills/pifm-holds` |
| 30 | Investigation completion gate | Partial | holds stay open until answered |

## Intake and dispatch

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 31 | Per-request project resolution, secondmate scope routing | Yes | `skills/pifm-projects`, `skills/pifm-secondmate` |
| 32 | Ship versus scout | Yes | task `kind`; scouts via `pifm_consult` |
| 33 | Diagnostic-reasoning procedure | Partial | `pifm-scout` agent; no dedicated skill |
| 34 | Mode, yolo, branch, base resolution | Partial | fixed `pifm/<id>` branches, default base only |
| 35 | No concurrency cap | Yes | `skills/pifm-task` |
| 36 | Brief scaffolds (ship, scout, charter) | Yes | `lib/brief.ts`, `lib/secondmates.ts` |
| 37 | Intent/Spec split with placeholder refusal | Yes | `checkTask` |
| 38 | Machine contract lines | Yes | `state/<id>.meta` |
| 39 | Home brief include | Yes | `config/brief-include.md` |
| 40 | Lab isolation brief | N/A | |
| 41 | Harness resolution | Yes | `lib/dispatch.ts` |
| 42 | Natural-language dispatch rules | Yes | `config/dispatch.json` ported from the captain's table |
| 43 | Quota-aware candidate arrays | Partial | availability-aware (installed + authenticated), not quota-aware |
| 44 | Typed dispatch resolution service | Deferred | |
| 45 | Effort policy | Yes | per-candidate effort |
| 46 | Spawn single, scout, secondmate, relaunch | Yes | `pifm_dispatch` (`note` for relaunch), `pifm secondmate start` |
| 47 | Per-harness launch templates | Yes | `config/harnesses.json`: pi, codex, claude, opencode |
| 48 | Launch via private file plus short line | Yes | brief file + one-line prompt |
| 49 | Launch environment allowlist | No | |
| 50 | Claude permission mode | Yes | `harnesses.json` |
| 51 | Worker account pins | N/A | single account per harness on this host |
| 52 | Trust dialog handling | Partial | pi `--approve`, codex `-c` trust override, claude dialog answer |
| 53 | AI commit-trailer stripping | Deferred | |
| 54 | Per-task turn-end and busy wiring | Yes | herdr agent state + status log |
| 55 | Trace-context propagation | Deferred | |
| 56 | Away spend cap | Deferred | |
| 57 | Fleet activity ledger | Yes | `state/events.log` |

## Isolation

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 58 | Pooled worktrees with isolation assertion | Plugin | pi-subagents worktrees; `ensureTaskWorktree`; brief Setup check |
| 59 | Orca worktrees | N/A | |
| 60 | Task, task-set, project-identity locks | Partial | unique ids in backlog; no file locks |
| 61 | Task marker, test refusal in primary checkout | Partial | supervisor never runs in a code checkout |
| 62 | Worker isolation self-check | Yes | brief Setup |
| 63 | Primary-checkout tangle detection | N/A | supervisor cwd is the home |
| 64 | cd, delegation and arm guards | Yes | `pifm-guard` |
| 65 | Gate lifecycle refusal | N/A | |

## Backends

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 66 | Backend abstraction | N/A | herdr only (`lib/pane.ts`) |
| 67 | tmux | N/A | |
| 68 | herdr adapter | Yes | `lib/pane.ts`; presentation spaces not ported |
| 69 | zellij, cmux, orca | N/A | |
| 70 | Backend selection | N/A | |
| 71 | Agent-state classifier | Plugin | herdr `agent get` states |
| 72 | Composer classifier | Plugin | herdr `agent prompt` (bracketed-paste aware) |

## Communication

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 73 | Durable steering inbox plus doorbell | Yes | `lib/inbox.ts`, `pifm send` |
| 74 | Re-ring ladder | Partial | supervisor wakes are re-delivered; crew doorbells are not re-rung |
| 75 | Typed plane for keys | Plugin | herdr `send-keys`, `agent prompt` |
| 76 | Resolve-key decision closing | Yes | `pifm status <id> resolved --key`, `pifm answer` |
| 77 | Fail-closed home on send | Yes | briefs embed the explicit `PIFM_HOME` |
| 78 | Status protocol | Yes | `lib/status.ts` |
| 79 | Keyed open-decision fold | Yes | `openDecisions` |
| 80 | Secondmate correlation and pending replies | Partial | `sm-<name>` status log; no correlation ids |
| 81 | Operational-input protocol | N/A | doorbells name a file |
| 82 | Control plane interrupt, exit, relaunch | Plugin | `subagent` interrupt/stop/resume; `pifm pane close`; relaunch via `pifm_dispatch` |
| 83 | Bounded peek | Plugin | `subagent` transcript view, `herdr pane read` |
| 84 | Captain inbox (out-of-band notes) | Deferred | |

## Supervision

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 85 | Zero-token watcher | Yes | `pifm-primary` timers |
| 86 | Durable wake queue with acks | Yes | `lib/wake.ts` |
| 87 | Drain sections | Partial | `PIFM_WAKE` rows, `pifm inflight`, `pifm log` |
| 88 | Coalescing, staleness, wedge ladder | Partial | staleness and pane-blocked only |
| 89 | Declared-wait recheck | Partial | `paused` is absorbed; no timed recheck |
| 90 | Worktree-write deferral | N/A | |
| 91 | Dead-endpoint reporting | Yes | pane `gone` wake |
| 92 | Parked-gate deferral, churn absorb | N/A | |
| 93 | Semantic busy state | Plugin | herdr states, pi-subagents run status |
| 94 | Current-state reader | Yes | `pifm inflight`, `pifm log` |
| 95 | Heartbeat with backoff | Partial | fixed 20 minutes, only with work in flight |
| 96 | Custom authenticated checks | Deferred | |
| 97 | Verified watcher arm | N/A | watcher is in-process |
| 98 | Per-harness wake protocols | Yes | one pi extension |
| 99 | No turn ends blind | Yes | delivery at `agent_settled`, re-delivery after 10 minutes |
| 100 | Pull-based guard banner | N/A | |
| 101 | Inactive outcome reconciliation | Yes | session-start reconcile step |
| 102 | Home summary ledger | Partial | `pifm bearings` |
| 103 | Fleet snapshot | Partial | `pifm inflight`, `pifm bearings` (text) |
| 104 | Pi supervision branch | N/A | one supervisor session |
| 105 | Supervision host | N/A | |
| 106 | Supervision leases | N/A | |
| 107 | Process-to-event sources | Deferred | candidate: pi-interactive-shell `monitor` |
| 108 | Host memory guard | N/A | |

## Validation and landing

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 109 | Gate pipeline contract | Yes | `pifm verify` → `pifm_review` → `pifm ship` |
| 110 | Foreground/background drive selection | N/A | |
| 111 | Ask-user finding escalation | Yes | `Finding: ... action=ask-user` → hold |
| 112 | Ask-user decision policy | Yes | persona, `skills/pifm-holds` |
| 113 | Mid-validation requirement changes | Partial | new decisions feed the next fix round |
| 114 | Run attribution | Yes | meta `run_id`, `integrated_run`, `head` |
| 115 | Mode-specific definitions of done | Yes | brief "Done means"; `pr` and `local` modes |
| 116 | Gerrit variant | Deferred | |
| 117 | Named-head gate | Yes | integrate base check, `--match-head-commit` |
| 118 | PR registration and merge poll | Yes | `pifm ship`, watcher PR poll |
| 119 | Guarded merge with live-green proof | Yes | `lib/ship.ts` `merge` |
| 120 | Merge authority persistence | Partial | `decisions.md` records the captain's word |
| 121 | Local fast-forward merge | Yes | `pifm merge-local` |
| 122 | yolo posture | Yes | `+yolo` in the registry |
| 123 | Review diff | Yes | `review/round-<n>/diff.patch` |
| 124 | PR blocker helpers | Yes | `pifm pr`, `gh` |
| 125 | Evidence branch | N/A | logs kept in `data/<id>/checks/` |
| 126 | Pipeline spend ledger | No | |
| 127 | Scout report and promotion | Partial | scout reports; promotion is a new ship task |
| 128 | Fail-closed teardown | Yes | `teardown` refuses unlanded work |
| 129 | Contribution follow-up | Deferred | |

## Secondmates

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 130 | Registry and routing by scope | Yes | `data/secondmates.md` |
| 131 | Transactional home seeding | Partial | seeded, no rollback |
| 132 | Project-less homes | Yes | homes start without projects |
| 133 | Charter contract | Yes | `data/charter.md` |
| 134 | Backlog handoff between homes | Partial | `pifm send sm-<name>` |
| 135 | Config propagation | Partial | new homes start from templates |
| 136 | Liveness sweep and auto-relaunch | Partial | pane `gone` wake; relaunch by hand |
| 137 | Wake-queue stall detection | N/A | |
| 138 | Parent-channel outcome publication | Yes | status lines on the parent's `sm-<name>` |
| 139 | Remote secondmates over SSH | Deferred | |
| 140 | Inventory reconcile requests | N/A | |

## Away and quiet

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 141 | Away record with the captain's words | Yes | `pifm afk away` |
| 142 | Away entry per harness | Yes | one supervisor |
| 143 | Sub-supervisor daemon | N/A | watcher is in-process |
| 144 | Return brief and catch-up | Yes | `skills/pifm-away` |
| 145 | Quiet mode | Yes | `pifm afk quiet`, `/quiet` |
| 146 | Wedge alarm | Deferred | |

## Captain surfaces and memory

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 147 | /ahoy | Yes | `prompts/ahoy.md`, `skills/pifm-ahoy` |
| 148 | /bearings | Yes | `pifm bearings`, `skills/pifm-bearings` |
| 149 | Visual decision boards | Plugin | pi-interview and pi-design-deck forms via `pifm-surfaces` |
| 150 | /stow tiered memory | Yes | `skills/pifm-stow` |
| 151 | Knowledge routing | Yes | `skills/pifm-stow` |
| 152 | Calm presentation mode | Partial | quiet mode |
| 153 | Public standalone stow skill | N/A | |

## Optional channels

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 154 | Relay for X and Discord | Deferred | |
| 155 | Relay follow-ups | Deferred | |
| 156 | Mail plane | Deferred | |
| 157 | Voice relay | Deferred | |
| 158 | Watched-tool update check | Deferred | |
| 159 | Codex App playbook | N/A | |

## Update and development

| # | Capability | Status | pi-fm |
|---|---|---|---|
| 160 | Guarded self-update | Yes | `pifm update`, `skills/pifm-update` |
| 161 | Shared-material change policy | Yes | repo `AGENTS.md`; changes ship by PR |
| 162 | Lint and tests | Yes | `bin/pifm-test` |
| 163 | Disposable lab homes | Yes | any `PIFM_HOME`; tests use temporary homes |
| 164 | CI lanes | Yes | `.github/workflows/ci.yml` |
