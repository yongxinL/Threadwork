---
name: tw-docs-health
description: Show spec library health — reference integrity, staleness, knowledge notes
---

# /tw:docs-health

Show the documentation health dashboard for this project's spec library.

## What this checks

1. **Reference integrity** — Are all files referenced in specs still present on disk?
2. **Cross-spec references** — Do all `SPEC:xxx` references point to real specs?
3. **Rule coverage** — Do rule globs match actual files?
4. **Design reference integrity** — Do all `design_refs` paths exist?
5. **Age staleness** — Are old specs covering heavily-changed code?
6. **Knowledge notes** — How many notes exist, their lifecycle state, and eligible promotions

## Usage

Run this after a phase completes or before planning begins to catch reference drift before it causes gate failures.

```
/tw:docs-health
```

## Implementation

Please execute the following steps:

1. Import and run the doc-freshness check:

```javascript
import { checkDocFreshness } from '.threadwork/lib/doc-freshness.js';
const result = checkDocFreshness('.threadwork/specs/', process.cwd());
```

2. Read knowledge notes state:

```javascript
import { readNotes, getCriticalNotes } from '.threadwork/lib/knowledge-notes.js';
const notes = readNotes();
const critical = getCriticalNotes();
```

3. Display a formatted health dashboard:

**SPEC LIBRARY HEALTH REPORT**
- Total issues found: {count}
- Blocking issues (errors): {count}
- Warnings: {count}

**Issues by type:**
- dead_reference: {list of affected specs}
- dead_cross_reference: {list}
- dead_design_reference: {list}
- age_staleness: {list}
- empty_rule_target: {list}
- dead_library_reference: {list}

**Knowledge Notes:**
- Total: {count}
- Critical (injected this session): {count}
- Eligible for promotion (survived 2+ sessions): {count}
- Already promoted: {count}

**Recommended actions:**
- For each dead_reference: update or remove the file reference in the spec
- For dead_design_reference: update the design file path or re-export the design asset
- For age_staleness: review the spec and update the `updated` frontmatter field
- For eligible notes: run `/tw:specs` to review and accept promoted proposals
