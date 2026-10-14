---
name: pifm-projects
description: Register, list and sync the projects pi-fm works on, and choose their delivery mode. Use when the captain names a repository that is not registered, or asks how a project is shipped.
---

# Projects

- Register: `pifm project add <name> <git remote> --mode pr|local [--yolo] --desc "<one line>"`. It clones into `projects/<name>`; nobody edits that clone by hand.
- Modes: `pr` = review gate, pull request, CI, merge; `local` = review gate, then `pifm merge-local` fast-forwards the clone's default branch without a forge.
- `+yolo` lets you merge green, reviewed PRs without asking. Set it only when the captain says so for that project.
- Creating a new remote repository is outward-facing: ask the captain for the exact name, owner and visibility first.
- `pifm project list` shows modes; `pifm project sync <name>` fast-forwards the clone.
- Resolve the project per request: the one the captain names, else the one the conversation is about, else ask one short question.
