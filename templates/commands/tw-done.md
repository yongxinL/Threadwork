---
name: tw:done
description: End the session — generate a 10-section handoff document and print the resume prompt
argument-hint: ""
allowed-tools: [Read, Write, Bash]
---

## Preconditions
- `.threadwork/state/project.json` must exist.

## Action

Generate a complete session handoff. This command should be run at the end of every coding session.

### Steps:

1. **Read session state**:
   - `.threadwork/state/project.json` — project name, phase, milestone, skill tier
   - `.threadwork/state/active-task.json` — currently active task
   - `.threadwork/state/completed-tasks.json` — tasks completed this session
   - `.threadwork/state/token-log.json` — token usage
   - `.threadwork/state/ralph-state.json` — quality gate status
   - Run `git log --oneline -5` for recent commits
   - Run `git status --short` for uncommitted files
   - Run `git rev-parse HEAD` for current SHA

2. **Prompt user for**:
   - Key decisions made this session (ask: "Any architectural or design decisions to record? List them, or press Enter to skip")
   - In-progress task completion % (if applicable)

3. **Generate handoff** at `.threadwork/workspace/handoffs/YYYY-MM-DD-N.md` with all 10 sections:
   1. Session Overview (date, duration estimate, phase/milestone)
   2. Completed This Session (task IDs + one-line descriptions)
   3. In Progress (active task + % if provided)
   4. Key Decisions Made
   5. Files Modified (from git diff since session start)
   6. Token Usage (used/budget/% + per-task table)
   7. Git State (branch, last SHA, uncommitted count)
   8. Quality Gate Status (last Ralph Loop result)
   9. Recommended Next Action (single sentence)
   10. Resume Prompt (self-contained block — see format below)

4. **Write checkpoint** to `.threadwork/state/checkpoint.json`

5. **Print the resume prompt** to the terminal:
```
── THREADWORK RESUME ──────────────────────────────
Project: <name> | Phase: <N> | Milestone: <M>
Last session: <date> | Branch: <branch>
Completed: <T-IDs comma-separated>
In progress: <task ID + description>
Next action: <recommended next action>
Token budget remaining: <N>K / <total>K
Skill tier: <tier>
─────────────────────────────────────────────────
Continue from where we left off. Load checkpoint
and resume task <ID>.
```

6. **Final message**:
   - Advanced/Ninja: "Session saved. Handoff at `.threadwork/workspace/handoffs/<filename>`. Paste the resume prompt above in your next session."
   - Beginner: More detailed explanation of what was saved and how to use it next time.

## Error Handling
- If git not available: skip git sections, note "git unavailable"
- If no tasks completed: section 2 reads "No tasks completed this session"
