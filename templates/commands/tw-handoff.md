---
name: tw:handoff
description: Handoff management — list, show, or resume from past session handoffs
argument-hint: "[list | show <N> | resume]"
allowed-tools: [Read]
---

## Preconditions
- `.threadwork/workspace/handoffs/` directory must exist.

## Actions

### No argument or `list`: List all handoffs
Read filenames from `.threadwork/workspace/handoffs/` and display:
```
── Session Handoffs ─────────────────────────
  1  2025-08-01  Phase 2 → Task T-2-1-3
  2  2025-07-31  Phase 1 complete
  3  2025-07-30  Phase 1 → Task T-1-3-2
─────────────────────────────────────────────
To view: /tw:handoff show <N>
To resume: /tw:handoff resume
```

Extract the phase/task info from each handoff's Section 3 (In Progress).

### `show <N>`: Display a specific handoff
Read the Nth most recent handoff file (1 = most recent) and display its full contents.

### `resume`: Print resume prompt
Read the most recent handoff file, extract Section 10 (Resume Prompt), and display it.

Output:
```
── Most Recent Resume Prompt ─────────────────
<resume prompt block>
──────────────────────────────────────────────
Paste this as your first message in the next session.
```

## Skill Tier Differences
- **Ninja**: All outputs compact, no labels
- **Beginner**: Include "What to do with this" instructions after each output

## Error Handling
- No handoffs found: "No session handoffs recorded yet. Run /tw:done at the end of a session to create one."
- Invalid show index: "Handoff #<N> not found. Run /tw:handoff list to see available handoffs."
