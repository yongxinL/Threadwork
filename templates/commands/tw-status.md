---
name: tw:status
description: Show full project status dashboard — phase, milestone, active task, token budget, and quality gate state
argument-hint: ""
allowed-tools: [Read, Bash, Glob]
---

## Preconditions
- `.threadwork/state/project.json` must exist. If missing, tell the user to run `threadwork init`.

## Action

Read the following files and compose a status dashboard:

1. `.threadwork/state/project.json` — project name, phase, milestone, active task, skill tier
2. `.threadwork/state/token-log.json` — session budget, used, remaining
3. `.threadwork/state/checkpoint.json` — if exists, note recovery available
4. `.threadwork/state/ralph-state.json` — if exists, note pending quality gate retries
5. `.threadwork/state/active-task.json` — current task details
6. Most recent file in `.threadwork/workspace/journals/` — last session summary

## Output Format

**Advanced/Ninja tier**: Compact table format:
```
── Threadwork Status ────────────────────────────────────
  Project:      <name>
  Phase:        <N> | Milestone: <N>
  Active task:  <task-id>: <description> (or None)
  Branch:       <git-branch>
  Token budget: <used>K / <total>K  (<pct>%)  [STATUS]
  Quality gates: PASS / FAIL / Not run
  Skill tier:   <tier>
  Checkpoint:   Available / None
─────────────────────────────────────────────────────────
```
Where [STATUS] is:
- ✅ Healthy (< 80%)
- ⚠️ Warning (80–90%)
- 🚨 Critical (> 90%)

**Beginner tier**: Add a "What this means" paragraph after the table explaining each item.

## Error Handling
- If `.threadwork/state/project.json` missing: "Threadwork not initialized. Run `threadwork init` first."
- If `token-log.json` missing: show token status as "Not tracked yet"
- If git is unavailable: show branch as "unknown"
