---
name: pifm-plan
description: Plan phase of a pi-fm epic. Turn data/<epic>/spec.md into small shippable tasks with a planner agent, then queue each task. Use right after the spec is approved.
---

# Plan

Goal: `data/<epic>/plan.md` and one queued task per plan entry, each covering named acceptance criteria.

1. Call `pifm_phase` with `action: "start"`, `label: "plan:<epic>"`.
2. Run `pifm project sync <project>` so the planner reads current code.
3. Call `pifm_consult` with `rule: "plan"`, `agent: "pifm-planner"`, `cwd: "<home>/projects/<project>"`, `output: "<epic>/plan.md"`, and a task that says:
   - read `<home>/data/<epic>/spec.md` and the existing code under the system's directory;
   - split the work into tasks a single crew member can finish and verify in under an hour, ordered so each one leaves the project working;
   - the first task sets up the skeleton, a `verify.sh` in the system's directory that runs every test (heavy services only in Docker with pinned images and a compose project name starting with `pifm-`), and wires that script into the repository's CI so pull requests run it;
   - output exactly this markdown, nothing else:

```
# Plan: <epic>

## Tasks

### <task-id>
- Title: <imperative title>
- Rule: <build-bounded | build-large | build-hard | build-parallel | design | trivial>
- Depends on: <none | task ids>
- Criteria: <numbers from the spec>
- Paths: <files or directories it touches>
- Verify: <one command, run from the repository root, that exits 0 only when this task works>
- Spec: <what to build, concretely>

## Coverage
- Criterion <n>: <task ids>
```

   Task ids are kebab-case and start with the epic id (`<epic>-menu`).
4. Read the plan. Every acceptance criterion must appear in Coverage, and every task needs Verify. If not, consult again with the gaps listed (at most twice), then decide yourself.
5. For each task, in plan order:
   - write `data/<id>/task.md` with `## Intent` (the epic's intent sentence plus the covered criteria copied verbatim from the spec) and `## Spec` (the plan's Spec, Paths, and "Task k of n in epic <epic>; earlier tasks already merged: ...");
   - run `pifm task new <id> --project <project> --title "<title>" --epic <epic> --verify "<command>"`;
   - run `pifm meta <id> rule=<rule> depends=<comma-separated ids or empty>`.
6. Run `pifm event plan "<epic> <n> tasks queued"`, call `pifm_phase` with `action: "end"`, `label: "plan:<epic>"`, and end your turn. The flow continues with `/skill:pifm-task`.
