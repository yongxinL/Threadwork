---
name: tw:clear
description: Clear context between phases — write a handoff, clear the checkpoint, and prepare for the next phase
argument-hint: ""
allowed-tools: [Read, Write]
---

## Preconditions
- `.threadwork/state/project.json` must exist.
- Should be run at the end of a phase, after `/tw:verify-phase N`.

## Action

1. Check that the current phase is verified. If not: "Current phase is not verified. Run /tw:verify-phase <N> before clearing."

2. Write a brief phase-end journal entry to `.threadwork/workspace/journals/`

3. Generate a handoff document (same as `/tw:done`) — captures completed phase state

4. Clear the checkpoint: update `checkpoint.json` to `{ "cleared": true }`

5. Update `project.json`:
   - Increment `currentPhase` by 1
   - Set `activeTask: null`

6. Print phase transition summary:

**Advanced tier**:
```
── Phase N Complete ───────────────────────────────
Phase N verified and closed.
Handoff written: .threadwork/workspace/handoffs/<filename>
Checkpoint cleared.
Ready for Phase N+1.

Next: Run /tw:discuss-phase N+1 to capture preferences, then /tw:plan-phase N+1.
──────────────────────────────────────────────────
```

**Ninja tier**:
```
Phase N → closed | Phase N+1 → ready
Next: /tw:discuss-phase N+1
```

**Beginner tier**: Add explanation of what "clearing context" means and why it helps maintain focus in the next phase.

## Error Handling
- Phase not verified: Block with clear message. Do not advance phase counter.
