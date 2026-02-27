---
name: tw:tier
description: View the current skill tier or change it — controls AI output verbosity across all commands
argument-hint: "[set <beginner|advanced|ninja>]"
allowed-tools: [Read, Edit]
---

## Preconditions
- `.threadwork/state/project.json` must exist.

## Actions

### No argument: Show current tier
Read `.threadwork/state/project.json` and display the `skillTier` field.

Output:
```
Current skill tier: advanced

Tiers:
  beginner — Step-by-step explanations, inline comments, hand-holding
  advanced — Concise summaries, professional output (current)
  ninja    — Code only, zero narration

To change: /tw:tier set <tier>
```

### `set <tier>`: Change tier
1. Validate the tier argument is one of: `beginner`, `advanced`, `ninja`
2. Read `.threadwork/state/project.json`
3. Update the `skillTier` field
4. Update the `_updated` timestamp
5. Write the file back

Output (all tiers):
```
✓ Skill tier changed to: <tier>
Takes effect on the next subagent invocation.
```

**Beginner tier output for `set`**: Add "What changed: All future AI responses will now include [description of tier behavior]."

## Error Handling
- Invalid tier name: "Invalid tier '<name>'. Valid options: beginner, advanced, ninja"
- File write error: Show the error with suggestion to check file permissions
