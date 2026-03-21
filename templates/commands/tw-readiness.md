---
name: tw-readiness
description: Harness readiness audit — spec coverage, gap detection, pre-execution scan
---

# /tw:readiness

Run a readiness audit before beginning a new phase. Checks spec coverage, detects capability gaps from previous sessions, and scans the upcoming plan for missing context.

## Usage

```
/tw:readiness
/tw:readiness --plan PLAN-2-1   # Scan a specific plan for gaps
```

## What this audits

1. **Spec coverage** — Coverage score for frontend/backend/testing domains
2. **Rule coverage** — Which domains have machine-checkable enforcement rules
3. **Recurring gaps** — Gaps from previous sessions that hit again
4. **Plan-level gaps** — Spec references in the plan that don't exist yet

## Implementation

Run the following analysis:

```javascript
import { auditHarnessReadiness, scanPlanForGaps } from '.threadwork/lib/spec-engine.js';
import { aggregateGaps } from '.threadwork/lib/state.js';

const readiness = auditHarnessReadiness();
const recurringGaps = aggregateGaps();
```

Then display:

```
── HARNESS READINESS AUDIT ──────────────────────────────────

Spec Coverage Score: {score}%

Domain Status:
  frontend: {has specs? Y/N} | {has rules? Y/N}
  backend:  {has specs? Y/N} | {has rules? Y/N}
  testing:  {has specs? Y/N} | {has rules? Y/N}

Gaps detected:
  {list readiness.gaps}

Recommendations:
  {list readiness.recommendations}

Recurring Capability Gaps (from prior sessions):
  HIGH: {gaps.high list}
  MEDIUM: {gaps.medium list}

─────────────────────────────────────────────────────────────
```

If `--plan PLAN-N-M` is provided, also scan that plan:

```javascript
import { readPlan } from '.threadwork/lib/state.js';
const planXml = readPlan('PLAN-N-M');
const planGaps = scanPlanForGaps(planXml);
```

Display plan gaps as warnings before the user proceeds to execution.
