---
name: pifm-update
description: Update the pi-fm harness itself. Use for /pifm-update or when the captain asks to update pi-fm.
---

# Update

1. `pifm update` fast-forwards the pi-fm code checkout. It refuses if the checkout has diverged.
2. Run `/reload` so this session loads the new extensions, skills and persona.
3. For each running secondmate, `pifm send sm-<name> "pi-fm was updated: run /reload"`.
4. Tell the captain the old and new commit in one line.
