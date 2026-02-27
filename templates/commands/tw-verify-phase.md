---
name: tw:verify-phase
description: Goal-backward verification that phase output meets requirements, plus token variance report
argument-hint: "<phase-number>"
allowed-tools: [Read, Write, Bash, Task]
---

## Preconditions
- Phase number N must be provided.
- Phase must have been executed (plans completed, SUMMARY.md files exist).
- `.threadwork/state/REQUIREMENTS.md` must exist.

## Action

### Step 1: Load verification targets
Read:
- `.threadwork/state/REQUIREMENTS.md` — get all REQ-IDs for this phase
- All SUMMARY.md files from executor agents
- `.threadwork/state/phases/phase-N/execution-log.json`

### Step 2: Spawn verifier subagent
Spawn `tw-verifier` with:
- Phase requirements (REQ-IDs list)
- SUMMARY.md files
- Done conditions from plan XMLs
- Instruction: verify each requirement is met with evidence

Verifier checks:
1. REQ-ID coverage: every requirement has a pass/fail status
2. Done conditions: each task's done-condition is met
3. Integration: cross-component interactions work
4. Regressions: no previously-passing tests now fail

### Step 3: Run automated quality gates
Run `runAll()` from quality-gate.js:
- TypeScript check
- Lint
- Tests (with coverage threshold)

### Step 4: If failures found — spawn debugger
If verifier or quality gates report failures:
- Spawn `tw-debugger` with hypothesis-testing protocol
- Debugger outputs fix attempts
- Re-run verification after fixes
- Loop up to 3 times

### Step 5: Generate VERIFICATION.md
Write `.threadwork/state/phases/phase-N/VERIFICATION.md`:
```markdown
# Phase N Verification

**Status**: PASSED / FAILED
**Date**: <date>

## Requirements Coverage

| REQ-ID | Description | Status | Evidence |
|--------|-------------|--------|----------|
| REQ-001 | ... | ✅ PASS | Auth flow tested |
| REQ-002 | ... | ❌ FAIL | Missing edge case |

## Quality Gates
- TypeScript: ✅
- Lint: ✅
- Tests: ✅ (coverage: 87%)

## Token Variance Report
<see format below>
```

### Step 6: Token Variance Report
Append to VERIFICATION.md:
```markdown
## Token Variance Report — Phase N

| Task | Estimated | Actual | Variance | Rating |
|------|-----------|--------|----------|--------|
| T-N-1-1 | 12K | 14K | +18% | Good |
...

Phase total: est <X>K, actual <Y>K, variance <Z>%
Accuracy rating: <Excellent/Good/Needs Improvement>

Lessons for future estimates:
- <recommendation based on variance patterns>
```

### Step 7: Generate UAT.md
Write `.threadwork/state/phases/phase-N/UAT.md` with manual verification steps for the user.

### Step 8: Update STATE.json
Only mark phase as `PHASE_VERIFIED` if ALL requirements pass AND all blocking quality gates pass.

## Error Handling
- Phase not executed: "No execution data found for Phase N. Run /tw:execute-phase N first."
- Debugger fails to fix issues after 3 attempts: Mark specific requirements as FAILED, surface to user.
