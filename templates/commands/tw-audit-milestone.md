---
name: tw:audit-milestone
description: Review all completed phases in a milestone against requirements — full milestone verification
argument-hint: "<milestone-number>"
allowed-tools: [Read, Write, Bash, Task]
---

## Preconditions
- Milestone number M must be provided.
- All phases for the milestone must be in `PHASE_VERIFIED` state.
- `.threadwork/state/ROADMAP.md` and `.threadwork/state/REQUIREMENTS.md` must exist.

## Action

### Step 1: Load milestone scope
Read ROADMAP.md to identify all phases in milestone M.
Check that each phase has a `VERIFICATION.md` file.

### Step 2: Spawn verifier for cross-phase audit
Spawn `tw-verifier` with:
- All VERIFICATION.md files
- All REQUIREMENTS.md entries scoped to this milestone
- Instruction: cross-phase integration check

Verifier checks:
1. All milestone-scoped REQ-IDs are met across the phases
2. No phase-to-phase integration regressions
3. Security requirements reviewed
4. Performance requirements reviewed (if any)

### Step 3: Run full test suite
`npm test` (or configured test command) to catch any regressions from multiple phases combined.

### Step 4: Generate MILESTONE-M-AUDIT.md
Write `.threadwork/state/milestones/milestone-M-audit.md`:

```markdown
# Milestone M Audit

**Date**: <date>
**Status**: PASSED / FAILED

## Phases Audited
- Phase N: ✅ PASSED
- Phase N+1: ✅ PASSED

## Requirements Coverage
| REQ-ID | Phase | Status | Evidence |
...

## Integration Check
...

## Security Review
...

## Recommended next milestone: <description>
```

### Step 5: Update STATE.json
If all pass: set milestone M to `MILESTONE_COMPLETE`.

## Error Handling
- Phases not all verified: "Phases [list] are not yet verified. Run /tw:verify-phase N for each."
- Tests fail: Run debugger, loop up to 3 times. If still failing, surface failures clearly.
