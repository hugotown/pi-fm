# pi-fm

A supervising agent harness for [pi](https://pi.dev). You talk to one supervisor; it turns your request into shipped work:

**Define** (an interview form agrees the spec) → **Plan** (a planner splits it into tasks) → **Build** (crew members in isolated worktrees, on pi or other harnesses) → **Verify** (rebase, the task's checks, an end-to-end verifier) → **Review** (three fresh reviewers, fix rounds with `review_loop`, captain decisions as holds) → **Ship** (pull request, CI, merge only on green at the reviewed head, teardown).

It reproduces the capabilities of [firstmate](https://github.com/kunchenguid/firstmate) natively on pi and these extensions: pi-subagents, pi-intercom, pi-messenger, pi-interview, pi-design-deck, pi-review-loop, pi-rewind-hook, pi-model-switch, pi-interactive-shell and pi-boomerang. See [docs/architecture.md](docs/architecture.md) and the [parity matrix](docs/parity-matrix.md).

## Requirements

pi 1.1+, Node 22.19+, git, gh (authenticated), herdr, jq, and the extensions above installed in pi. Docker for systems that need services.

## Start

```bash
~/pi-fm/bin/pifm init
~/pi-fm/bin/pifm project add <name> <git remote> --mode pr
~/pi-fm/bin/pifm doctor
~/pi-fm/bin/pi-fm            # inside a herdr pane
```

Then ask: `/pifm build a kiosk for our factory canteen`.

Captain commands: `/pifm`, `/bearings`, `/ahoy`, `/afk`, `/quiet`, `/stow`, `/pifm-update`. Progress is also written to `$PIFM_HOME/state/events.log`.

## Examples

Built end to end by pi-fm from a single request: [`examples/comedor-kiosk`](examples/comedor-kiosk) and [`examples/h-kart`](examples/h-kart).
