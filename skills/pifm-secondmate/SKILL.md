---
name: pifm-secondmate
description: Run a persistent second pi-fm supervisor with its own home and scope, route work to it and read its reports. Use when the captain wants a standing owner for an area (a project, a domain) or more parallel supervision.
---

# Secondmates

- Create: `pifm secondmate add <name> --scope "<what it owns>"` seeds a home under `secondmates/<name>` with a charter.
- Start: `pifm secondmate start <name>` opens it in its own herdr tab (it runs its own session start and waits).
- Route work: `pifm send sm-<name> "<the captain's request, verbatim, plus any context>"`. Requests in its scope go to it; everything else stays with you.
- It reports by appending status lines to `sm-<name>`; they wake you like any crew status. Relay outcomes to the captain in your words.
- Inspect: `pifm log sm-<name>`, `herdr pane read <pane_id> --source recent --lines 80 --format text`.
- A secondmate never creates secondmates.
