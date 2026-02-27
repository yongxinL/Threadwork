---
name: tw:variance
description: Show token variance report for the current phase — estimated vs actual per task with recommendations
argument-hint: ""
allowed-tools: [Read]
---

## Preconditions
- `.threadwork/state/token-log.json` must exist.
- At least one task must have been executed with both estimated and actual token counts.

## Action

1. Read `.threadwork/state/token-log.json`
2. Group tasks by phase (parse task IDs like `T-1-2-3` where 1 = phase)
3. Calculate per-task and per-phase variance
4. Generate recommendations based on patterns

## Output Format

**Advanced tier**:
```
── Phase Variance Report ──────────────────────────────
Phase 1 — 14 tasks

  Task       Est     Actual   Var    Rating
  ─────────────────────────────────────────
  T-1-1-1   12K     14K     +18%   Good
  T-1-1-2    8K      7K     -11%   Good
  T-1-1-3   20K     31K     +55%   Needs Improvement
  T-1-2-1   15K     16K      +7%   Excellent
  ...

  Phase total:  est 180K  actual 206K  +14%  Good

Insights:
  → Complex tasks (T-1-1-3, T-1-2-2) overestimated by avg 48%
  → Apply 1.4× multiplier to future complex task estimates
  → Simple/medium tasks: estimates accurate (avg ±12%)
─────────────────────────────────────────────────────
```

**Ninja tier**: Table + one-line insight per pattern.

**Beginner tier**: Full table + explanation of why estimation accuracy matters for planning future sessions.

## Recommendation logic:
- If complex tasks avg > 30% over: "Add 1.5× multiplier for complex tasks"
- If all tasks under: "Your estimates are conservative — reduce multipliers"
- If variance < 15% overall: "Estimation accuracy is excellent — no adjustment needed"

## Error Handling
- No variance data: "No task data yet. Variance data accumulates as you execute tasks."
