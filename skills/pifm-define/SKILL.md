---
name: pifm-define
description: Define phase of a pi-fm epic. Turn a captain's request into an agreed spec (data/<epic>/spec.md) by asking the captain through an interview form. Use when the captain asks to build or substantially change a system.
---

# Define

Goal: `data/<epic>/spec.md`, agreed with the captain, that every later phase treats as the acceptance contract.

1. Pick an epic id: short kebab-case (`comedor-kiosk`). Call `pifm_phase` with `action: "start"`, `label: "define:<epic>"`.
2. Read `data/captain.md` for standing preferences and `pifm project list` for registered projects. Decide where the system lives: a registered project, and the directory inside it (for example `examples/<epic>/` in a monorepo). If no project fits, ask in the interview below and register it with `/skill:pifm-projects`.
3. Ask the captain with the `interview` tool. One form, at most about ten questions, every question with a recommended default so the captain can accept quickly:
   - who uses it and the main jobs they do,
   - must-have features for the first version (multi-select with your proposed list),
   - platform and stack constraints (offer a recommended stack),
   - data that must persist, integrations,
   - what "done" looks like: how the captain will try it,
   - explicitly out of scope,
   - look and feel (single choice) when there is a UI.
   Pass `timeout: 1800`. Do not invent answers: if the form times out, ask once more in chat and wait.
4. When the look and feel matters and the captain has no clear picture, show 2 to 4 directions with `design_deck` and use the selection.
5. Write `data/<epic>/spec.md` with exactly these sections:
   - `## Intent`: the captain's original request and every answer, verbatim.
   - `## Acceptance criteria`: numbered, each one observable by running the system (a user action and its visible result).
   - `## Out of scope`
   - `## Decisions`: choices you made on the captain's behalf, each with its reason.
   - `## Project`: project name, directory, and how the system is started and checked (one command each).
6. Confirm with one more `interview`: an `info` block summarising the criteria and a single question "Approve this spec?" (Approve / Change something + text). Apply changes and confirm again if needed.
7. Run `pifm event define "<epic> spec approved"`, then call `pifm_phase` with `action: "end"`, `label: "define:<epic>"`, and end your turn. The flow continues with `/skill:pifm-plan`.
