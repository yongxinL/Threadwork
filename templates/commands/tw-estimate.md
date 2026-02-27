---
name: tw:estimate
description: Show a token estimate for a task before committing to it
argument-hint: "<task description>"
allowed-tools: [Read]
---

## Preconditions
- A task description must be provided as the argument.
- `.threadwork/state/token-log.json` should exist for budget comparison (not required).

## Action

1. Parse the task description from `$ARGUMENTS`
2. Classify complexity based on keywords and scope:
   - **Simple** (1–2 files, clear scope): 5K–15K tokens
   - **Medium** (3–5 files, some complexity): 15K–40K tokens
   - **Complex** (6+ files, architecture decisions): 40K–80K tokens
3. Apply multipliers for:
   - Auth/security tasks: ×1.5
   - Multi-service integration: ×1.5
   - Planning-only tasks: ×0.7
4. Read current budget from token-log.json
5. Calculate what % of remaining budget this would consume

## Output Format

**Advanced tier**:
```
Task: "<description>"
Complexity: Medium (auth logic, 2–3 files)
Estimate:   15,000 – 25,000 tokens

Current remaining budget: 488K tokens
This task would consume: ~4% of remaining budget
Verdict: ✅ Safe to proceed
```

**Ninja tier**:
```
Est: 15K–25K tokens | ~4% of budget | ✅
```

**Beginner tier**: Add explanation of what token estimates mean and why they're approximate.

## Verdicts:
- ✅ Safe: Task estimate < 20% of remaining budget
- ⚠️ Caution: Task estimate is 20–40% of remaining budget
- 🚨 Risk: Task estimate > 40% of remaining budget — suggest splitting the task

## Error Handling
- No argument provided: "Please provide a task description. Example: /tw:estimate add JWT refresh token rotation"
