# /tw:cost — Cost Budget Dashboard

Show the current session cost budget usage, breakdown by model tier, and projection.

## Usage

```
/tw:cost           — Cost budget dashboard (current session)
/tw:cost history   — Cost across all sessions for this project
```

## What This Command Does

1. Load the dual budget report from `lib/token-tracker.js getDualBudgetReport()`
2. Display cost budget dashboard in the format below
3. If subcommand is `history`: scan `.threadwork/workspace/sessions/` for all session summaries and display a table

## Dashboard Format

```
── Threadwork Cost Budget ───────────────────────────────
Session budget:    $5.00
Used this session: $1.84  (37%)
Remaining:         $3.16  (63%)

Status: ✅ Healthy

By model tier this session:
  Haiku   12K tokens   $0.01
  Sonnet  285K tokens  $0.86
  Opus    20K tokens   $0.97

Projected session end (at current rate): ~$2.40
─────────────────────────────────────────────────────────
```

Status thresholds:
- `✅ Healthy` — below 70% of cost budget
- `⚠️ Warning` — 70%–89% of cost budget
- `🚨 Critical` — 90%+ of cost budget

## History Format

```
── Session Cost History ─────────────────────────────────
Session  Date        Tokens   Cost    vs Budget
1        2025-02-01  210K     $1.20   24%
2        2025-02-03  380K     $2.80   56%
3        2025-02-07  290K     $1.95   39%

Project total: $5.95 across 3 sessions
─────────────────────────────────────────────────────────
```

Read session summaries from: `.threadwork/workspace/sessions/YYYY-MM-DD-N.json`

## Implementation Notes

Use `getDualBudgetReport()` from `lib/token-tracker.js` — do not re-implement the calculation.

For projected end cost: `costUsed / tokenUsed * tokenBudget` (assumes linear cost rate).
