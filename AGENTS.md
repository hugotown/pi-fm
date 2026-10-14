# pi-fm repository

pi-fm is a supervising agent harness for [pi](https://pi.dev): a supervisor session takes a request through Define, Plan, Build, Verify, Review and Ship, with crew members working in isolated git worktrees. This file is for anyone changing this repository, including pi-fm crew members working in a worktree of it.

## Layout

| Path | What |
|---|---|
| `lib/` | Shared logic (TypeScript run directly by Node's type stripping); one module per contract |
| `cli/main.ts`, `bin/pifm` | The `pifm` command: every deterministic operation |
| `bin/pi-fm` | Launches the supervisor (interactive pi with `$PIFM_HOME` as cwd) |
| `extensions/` | pi extensions, active only in the supervisor session: watcher and tools, guard, form proxy |
| `agents/` | pi-subagents agent definitions (crew, reviewer, planner, verifier, scout) |
| `skills/`, `prompts/` | Supervisor procedures and captain commands |
| `templates/` | What `pifm init` copies into a home (persona, dispatch table, harness launch specs, aliases) |
| `workflows/` | pi-subagents workflow scripts |
| `examples/<name>/` | Systems built end to end by pi-fm; each has a `verify.sh` that CI runs |
| `docs/` | Architecture, parity matrix against firstmate, runbook |

## Conventions

- Code, comments, docs and commit messages in English.
- No dependencies for the harness itself: Node built-ins only; `lib/` must not import pi packages so tests run without them.
- Agents hand off plain text and markdown. Never add structured-output or JSON contracts between agents; scripts may read JSON from tools (gh, herdr) themselves.
- Every external command is bounded by a timeout (`lib/exec.ts`).
- Tests: `bin/pifm-test` (unit tests in `tests/`). Add a test with every change to `lib/`.

## Examples

Each `examples/<name>/` is self-contained with its own README and a `verify.sh` that exits 0 only when the system works. Heavy services run in Docker with images pinned to exact tags, compose project names starting with `pifm-`, and host ports bound to 127.0.0.1 and detected free. `verify.sh` tears down everything it starts.

## Runbook

Setup (verified on the development host):

```bash
export PIFM_HOME="$HOME/pi-fm-home"        # operational home; holds secrets-free state only
~/pi-fm/bin/pifm init                      # creates the home, persona, config
~/pi-fm/bin/pifm project add pi-fm https://github.com/hugotown/pi-fm.git --mode pr --yolo --desc "pi-fm and its examples"
~/pi-fm/bin/pifm doctor                    # tools, auth, dispatch rules
~/pi-fm/bin/pi-fm                          # start the supervisor, inside a herdr pane
```

Teardown of one task is `pifm teardown <id>`. Removing a whole home deletes its backlog, memory and task history: close its herdr tabs, check `git -C $PIFM_HOME/projects/<p> worktree list` holds nothing unlanded, then remove the directory.
