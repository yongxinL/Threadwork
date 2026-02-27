---
name: tw:parallel
description: Run a task in an isolated git worktree — implement, run Ralph Loop, create PR
argument-hint: "<feature description> [--dry-run]"
allowed-tools: [Read, Write, Bash, Task]
---

## Preconditions
- A feature description must be provided.
- Must be in a git repository.
- `.threadwork/` must be initialized.

## Action

### Step 1: Create worktree
1. Sanitize the feature description to a branch-safe name: `tw-parallel/<slug>`
2. Run: `git worktree add -b tw-parallel/<slug> .threadwork/worktrees/<slug>`
3. Copy `.threadwork/specs/` into the worktree for spec access

If `--dry-run`: show what would be created, exit without creating.

### Step 2: Spawn dispatch agent
Spawn `tw-dispatch` with:
- Feature description
- Worktree path
- Relevant specs (from spec-engine)

Dispatch orchestrates: Implement → Check (Ralph Loop) → Finish → PR

### Step 3: Monitor
Display progress updates as dispatch reports them.

### Step 4: On completion
If Ralph Loop passes and implementation is complete:
- Create a draft PR: `gh pr create --draft --title "<feature>" --body "<summary>"`
- OR print merge instructions if `gh` is not available

### Step 5: Cleanup
On successful merge or `/tw:parallel cancel`:
- Run: `git worktree remove --force .threadwork/worktrees/<slug>`
- Delete the branch: `git branch -d tw-parallel/<slug>`

## Commands
- `/tw:parallel <description>` — start parallel execution
- `/tw:parallel cancel <slug>` — cancel and clean up worktree
- `/tw:parallel status` — list active worktrees

## Error Handling
- Git worktree creation fails: Show error and suggest checking available disk space
- Dispatch agent fails: Show Ralph Loop error and offer to resume or cancel
