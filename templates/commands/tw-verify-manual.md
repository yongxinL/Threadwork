---
name: tw-verify-manual
description: Structured manual verification — report pass/fail for each manual check in the verification profile
---

# /tw:verify-manual

Report manual verification results for the current phase. Works with the verification profile configured during discuss-phase to provide structured feedback on manual checks.

## Usage

```
/tw:verify-manual
```

## What it does

1. Reads the verification profile from `project.json`
2. Displays each manual check with expected behavior
3. Guides you through reporting pass/fail/skip for each check
4. Records results to gap report for critical failures
5. Blocks phase completion if any critical check fails

## Implementation

```javascript
import { loadProfile } from '.threadwork/lib/verification-profile.js';
import { readState } from '.threadwork/lib/state.js';

const projectJson = readState();
const profile = loadProfile(projectJson);
```

Display each manual check and collect feedback:

```
── MANUAL VERIFICATION CHECKLIST ─────────────────────────────

Profile type: {profile.type}
Phase: {current phase}

Manual checks:
  1. {check.description}
     Expected: {check.expected}
     Critical: {check.critical ? 'YES — blocks phase completion' : 'no'}
     Your result: [PASS / FAIL / SKIP]

  2. ...
──────────────────────────────────────────────────────────────
```

For each FAIL result:
- If critical: block phase completion, log as gap report entry with `type: 'verification_failure'`
- If not critical: log as warning, allow phase completion

For PASS results: record in gap report as verification evidence.

## After all checks

```
── VERIFICATION SUMMARY ──────────────────────────────────────
Passed: {count}
Failed: {count} {critical_count > 0 ? '⛔ PHASE BLOCKED' : ''}
Skipped: {count}

{critical failures list if any}
──────────────────────────────────────────────────────────────
```

If any critical checks fail, do NOT allow `/tw:verify-phase` to complete until the failures are resolved.
