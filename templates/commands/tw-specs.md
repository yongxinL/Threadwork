---
name: tw:specs
description: Manage the spec library — list, show, search, add, edit, and review AI-proposed updates
argument-hint: "[list | show <domain/name> | proposals | accept <id> | reject <id> | add <domain> | edit <domain/name> | search <query>]"
allowed-tools: [Read, Write, Edit, Glob]
---

## Preconditions
- `.threadwork/specs/` directory must exist.

## Actions

### `list` (or no argument)
Scan `.threadwork/specs/` for all `.md` files (excluding index.md and proposals/).
Display grouped by domain:
```
── Spec Library ────────────────────────────────────
frontend/
  react-patterns     updated: 2025-08-01  confidence: 0.9
  styling            updated: 2025-07-30  confidence: 0.8

backend/
  api-design         updated: 2025-08-01  confidence: 0.9
  auth               updated: 2025-07-31  confidence: 0.85

testing/
  testing-standards  updated: 2025-07-28  confidence: 0.9
───────────────────────────────────────────────────
5 specs | 2 pending proposals
To view a spec: /tw:specs show <domain/name>
To review proposals: /tw:specs proposals
```

### `show <domain/name>`
Read and display the spec file at `.threadwork/specs/<domain>/<name>.md`. Show full content.

### `proposals`
List all files in `.threadwork/specs/proposals/`.
Show proposalId, source spec, reason, and confidence for each.

### `accept <proposalId>`
1. Read the proposal file from `.threadwork/specs/proposals/<proposalId>.md`
2. Extract the `specName` field from frontmatter
3. Write the spec content to the active spec path
4. Delete the proposal file
5. Confirm: "✓ Spec updated: <domain/name>"

### `reject <proposalId>`
Delete `.threadwork/specs/proposals/<proposalId>.md`
Confirm: "✓ Proposal rejected and deleted."

### `add <domain>`
Prompt for spec name and content, then write a new spec file with proper frontmatter:
```markdown
---
domain: <domain>
name: <name>
updated: <today>
confidence: 0.9
tags: [<relevant>, <tags>]
---
# <Name>

## Rule: <first rule>
...
```

### `edit <domain/name>`
Read the spec file and display it for editing. Then apply changes.

### `search <query>`
Full-text search across all spec files. Return matching specs with excerpt.

## Error Handling
- `show` with unknown spec: "Spec not found: <domain/name>. Run /tw:specs list to see available specs."
- `accept`/`reject` with unknown ID: "Proposal not found: <id>. Run /tw:specs proposals to list pending proposals."
