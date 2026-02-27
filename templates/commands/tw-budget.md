---
name: tw:budget
description: Show the current session token budget dashboard with used/remaining/% and last task variances
argument-hint: ""
allowed-tools: [Read]
---

## Preconditions
- `.threadwork/state/token-log.json` must exist (created by `threadwork init`).

## Action

Read `.threadwork/state/token-log.json` and render the budget dashboard.

## Output Format

**Advanced tier**:
```
── Threadwork Token Budget ─────────────────────
Session budget:    800,000 tokens
Used this session: 312,000 tokens  (39%)
Remaining:         488,000 tokens  (61%)

Status: ✅ Healthy

Last 3 tasks:
  T-1-1-1  est 12K  actual 14K  +18%  Good
  T-1-1-2  est  8K  actual  7K  -11%  Good
  T-1-1-3  est 20K  actual 31K  +55%  Needs Improvement
───────────────────────────────────────────────
```

**Ninja tier**: One-line summary only:
```
[TOKEN: 312K/800K | 39% | ✅]
```

**Beginner tier**: Dashboard plus explanation paragraph:
> "Your session budget is the total number of tokens (roughly words/characters) that can be processed in this conversation. You've used 39% so far. When you approach 80%, consider wrapping up the current task and starting a new session to avoid losing context."

## Status indicators:
- ✅ Healthy: < 80% consumed
- ⚠️ Warning: 80–90% consumed — "Consider wrapping up after the current task"
- 🚨 Critical: > 90% consumed — "Run /tw:done NOW before context is lost"

## Error Handling
- If token-log.json missing: "Token tracking not initialized. Run 'threadwork init' to set up."
