---
name: tw:journal
description: View or search session journals
argument-hint: "[list | show <N> | search <query>]"
allowed-tools: [Read, Glob]
---

## Preconditions
- `.threadwork/workspace/journals/` must exist.

## Actions

### `list` (or no argument)
List all journal files sorted newest-first:
```
── Session Journals ─────────────────────────
  1  2025-08-01  Phase 2 — 3 tasks completed
  2  2025-07-31  Phase 1 complete
  3  2025-07-30  Phase 1 — debugging auth
─────────────────────────────────────────────
To view: /tw:journal show <N>
```

### `show <N>`
Display the Nth most recent journal (1 = most recent).

### `search <query>`
Search all journal files for the query string. Return matching entries with excerpts and dates.

Output:
```
── Journal Search: "<query>" ──────────────────
1. 2025-08-01: "...decided to use Prisma ORM after evaluating..."
2. 2025-07-30: "...auth token refresh pattern..."
───────────────────────────────────────────────
```

## Error Handling
- No journals found: "No journal entries yet. Journals are written automatically at session end with /tw:done."
