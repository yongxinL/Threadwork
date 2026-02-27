---
name: tw:resume
description: Load the most recent session handoff and announce readiness to continue
argument-hint: ""
allowed-tools: [Read, Bash]
---

## Preconditions
- `.threadwork/workspace/handoffs/` must contain at least one handoff file.
- OR `.threadwork/state/checkpoint.json` must exist.

## Action

1. Read the most recent file from `.threadwork/workspace/handoffs/`
2. Read `.threadwork/state/checkpoint.json`
3. Read `.threadwork/state/project.json`
4. Read `.threadwork/state/token-log.json` for remaining budget

Parse from the handoff:
- Section 3: In Progress task
- Section 9: Recommended Next Action
- Section 7: Git state (branch, last SHA)

Then announce readiness:

**Advanced tier**:
```
Threadwork context restored.

Phase: <N> | Milestone: <M>
Branch: <branch> | Last commit: <short-sha>
Last completed: <task-id>: <description>
In progress: <task-id>: <description>
Token budget: <remaining>K / <total>K remaining (<pct>%)
Skill tier: <tier>

Ready. Next: <recommended next action>
```

**Ninja tier**:
```
Phase <N> | Task <id> | Budget: <remainK>K | ✅ Ready
Next: <action>
```

**Beginner tier**: Full readout plus "What this means" explanation for each item. Explain what the in-progress task is and what to do next in plain language.

## If no handoff exists but checkpoint does:
Read from checkpoint.json and produce a simplified readout:
```
No handoff found — restoring from checkpoint.
Phase: <N> | Task: <task-id>
Branch: <branch>
Continue from: <nextAction>
```

## Error Handling
- No handoff AND no checkpoint: "No previous session data found. Start with /tw:new-project or /tw:status."
