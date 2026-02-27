---
name: tw:tokens
description: Show the full session token log with per-task breakdown and running total
argument-hint: ""
allowed-tools: [Read]
---

## Preconditions
- `.threadwork/state/token-log.json` must exist.

## Action

Read `.threadwork/state/token-log.json` and display the full token history.

## Output Format

**Advanced tier**:
```
── Threadwork Token Log ───────────────────────────────────────────
Session budget:    800,000 tokens
Used this session: 312,000 tokens  (39%)
Remaining:         488,000 tokens

Task History:
  Task ID       Est      Actual   Variance  Rating
  ─────────────────────────────────────────────────
  T-1-1-1      12,000   14,200    +18%     Good
  T-1-1-2       8,000    7,100    -11%     Good
  T-1-1-3      20,000   31,000    +55%     Needs Improvement
  tool-Bash      ~800     ~800      0%      Excellent
  ─────────────────────────────────────────────────
  Phase total  40,800   53,100    +30%

Cumulative (all sessions):  est 180K  actual 212K  +18%
──────────────────────────────────────────────────────────────────
```

**Ninja tier**: Table only, no labels.

**Beginner tier**: Add column explanations and a note on what "Needs Improvement" means for future planning accuracy.

## Variance Ratings:
- Excellent: < ±10%
- Good: ±10–20%
- Needs Improvement: > ±20%

## Error Handling
- If token-log.json is missing: "No token data recorded. Token tracking begins automatically with your next task."
