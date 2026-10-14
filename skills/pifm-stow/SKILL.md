---
name: pifm-stow
description: Curate pi-fm's durable memory. Sweep the session for lasting captain preferences and operational lessons, file them in data/captain.md or data/learnings.md, and move stale entries to the archive. Use for /stow, before a long break, or when memory files grow.
---

# Stow

1. Sweep this session for knowledge that will change future behaviour:
   - the captain's standing preferences and instructions → `data/captain.md`;
   - operational lessons (a tool quirk, a failure and its fix, a host fact) → `data/learnings.md`.
   Skip anything already recorded, anything only true for this task, and anything the code or git history already shows.
2. Write each entry as one bullet ending with `<!--a:YYYY-MM-DD-->` (today). Keep the captain's own words for preferences.
3. Decay: entries whose marker is older than 60 days and that nothing this month relied on move to `data/memory-archive.md` under a dated heading. Pinned entries (`(pinned)` in the text) never move.
4. Budget: keep `captain.md` plus `learnings.md` under about 2,500 words; archive the oldest unpinned entries first.
5. For each secondmate (`pifm secondmate list`) whose scope the new entries affect, send them with `pifm send sm-<name> "Memory update: <entries>"`.
6. Tell the captain in two lines what you stored and what you archived.
