---
name: pifm-bearings
description: Give the captain a four-part status digest (Captain's call, Recently landed, Underway, Charted next). Use for /bearings or "where are we".
---

# Bearings

1. `pifm bearings` prints the four sections from the backlog, holds and live tasks.
2. Add live facts where they matter: `pifm pr <id>` for tasks that are shipping.
3. Reply in the captain's language with the four sections in this order, one line per item, full PR URLs. Lead with the Captain's call; say "nothing" for empty sections.
4. If the captain asked for a file, also write it to `data/bearings-<YYYY-MM-DD>.md`.
