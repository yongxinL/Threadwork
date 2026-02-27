---
name: tw:recall
description: Search across journals, handoffs, specs, and project history for past context
argument-hint: "<search query>"
allowed-tools: [Read, Glob, Grep]
---

## Preconditions
- A search query must be provided as the argument.

## Action

Search the following locations for the query string (case-insensitive):

1. `.threadwork/workspace/journals/*.md` — session journals
2. `.threadwork/workspace/handoffs/*.md` — session handoffs
3. `.threadwork/specs/**/*.md` — spec library
4. `.threadwork/state/REQUIREMENTS.md` — if exists
5. `.threadwork/state/ROADMAP.md` — if exists
6. `.threadwork/state/phases/*/CONTEXT.md` — phase context files

For each match:
- Note source file and date
- Extract the matching line + 2 lines of context
- Rank by: recency × relevance (more recent = higher)

Return top 5 results.

## Output Format

**Advanced tier**:
```
── Recall: "<query>" ──────────────────────────────

1. journals/2025-08-01-1.md (2025-08-01)
   "...decided to use JWT refresh token rotation after evaluating..."

2. specs/backend/auth.md
   "## Rule: Always use httpOnly cookies for JWT storage..."

3. handoffs/2025-07-31-1.md (2025-07-31)
   "Key decision: Chose PostgreSQL for user sessions..."

── 3 results found ─────────────────────────────────
```

**Ninja tier**: Filename + one-line excerpt per result, no headers.

**Beginner tier**: Results plus context explaining where each result came from.

## Error Handling
- No argument: "Please provide a search query. Example: /tw:recall JWT authentication"
- No results: "No matches found for '<query>'. Try a shorter term or different keywords."
