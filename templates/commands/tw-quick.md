---
name: tw:quick
description: Fast-path task execution for tasks that don't need full phase orchestration
argument-hint: "<task description> [--full]"
allowed-tools: [Read, Write, Edit, Bash, Task, Glob, Grep, TodoWrite]
---

## Preconditions
- `.threadwork/state/project.json` must exist (for spec injection and token tracking).

## Action

### Step 1: Token estimate
Before doing anything else, show the token estimate:

**Advanced tier**: "Task: '<description>' | Estimate: ~<N>K–<M>K tokens | ~<pct>% of remaining budget. Proceeding."
**Ninja tier**: "Est: ~<N>K | <pct>% | Proceeding"
**Beginner tier**: Full estimate block with explanation of what the estimate means.

If budget < 20% remaining: ask "Token budget is below 20%. Continue anyway? (yes/no)"

### Step 2: Select relevant specs
Read relevant specs from `.threadwork/specs/` based on the task description.

### Step 3: Execute
Implement the task directly (no subagent spawn for simple tasks).

If `--full` flag is present OR task is complex (> 30K token estimate):
- Spawn a `tw-executor` subagent with full spec injection
- Run quality gates after completion

Otherwise, implement inline with spec context.

### Step 4: Commit
After implementation:
- Run `git add -A && git commit -m "feat: <task-description-slug>"`
- Run quality gates (typecheck + lint)

### Step 5: Update journal + token log
- Add entry to token log with estimated and actual usage
- Note the quick task in the next journal

## Output on completion:

**Advanced tier**:
```
✅ Quick task complete
Files changed: src/components/Button.tsx, src/styles/button.css
Commit: abc1234 "feat: add loading state to Button component"
Token usage: ~8K tokens (est 6K)
```

## Error Handling
- No argument: "Please provide a task description. Example: /tw:quick add loading spinner to Button component"
- If task description is vague: Ask 1–2 clarifying questions before proceeding
