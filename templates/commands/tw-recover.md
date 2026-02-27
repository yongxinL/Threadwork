---
name: tw:recover
description: Restore project context after a session crash or context loss
argument-hint: ""
allowed-tools: [Read, Bash]
---

## Preconditions
- `.threadwork/state/checkpoint.json` must exist and not be cleared.

## Action

1. Read `.threadwork/state/checkpoint.json`
2. Read `.threadwork/state/project.json`
3. Run `git status --short` to see current uncommitted state
4. Run `git log --oneline -3` to orient on recent history
5. Read the most recent handoff from `.threadwork/workspace/handoffs/` if available

Compose a recovery report and orient the session:

**Advanced tier**:
```
── Recovery Mode ───────────────────────────────────
Checkpoint found: <timestamp>

State at checkpoint:
  Phase:        <N>
  Milestone:    <M>
  Active task:  <task-id>: <description>
  Branch:       <branch>
  Last commit:  <sha>
  Uncommitted:  <N> files

Recent git history:
  <sha> <message>
  <sha> <message>

Token budget at checkpoint: <N>K remaining

Recovery recommendation:
  <one-sentence suggestion, e.g., "Resume task T-2-1-3 — the last commit shows partial progress.">
────────────────────────────────────────────────────
```

**Ninja tier**: One-line per item, no headers.

**Beginner tier**: Full report plus explanation of what caused the checkpoint and what "recovery" means in practice.

## Error Handling
- No checkpoint found: "No recovery checkpoint found. Your session may have ended cleanly. Run /tw:resume to load the last handoff."
- Checkpoint is cleared (from clean phase completion): "Checkpoint was cleared — no recovery needed. Run /tw:resume to reload context."
