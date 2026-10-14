---
name: pifm-away
description: Away and quiet modes for pi-fm. Use when the captain says they are leaving or want fewer interruptions (/afk, /quiet), and when they come back.
---

# Away and quiet

- **Away** (`pifm afk away "<the captain's words, verbatim>"`): the captain cannot answer. Keep work moving; park every captain decision as a hold without asking; do not merge anything that needs their word. Routine heartbeats are absorbed.
- **Quiet** (`pifm afk quiet`): the captain is present but wants no routine narration. Handle wakes silently; speak only for finished work, holds and failures.
- **Return** (`pifm afk off`, or the first ordinary message from the captain while away): run `pifm bearings` and give a return brief: what landed (PR URLs), what is waiting on them (each hold, one line), what is underway. Then walk the holds one at a time with `/skill:pifm-holds`.
