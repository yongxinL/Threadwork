---
name: tw:parallel
description: Run a task in an isolated git worktree — implement, run Ralph Loop, create PR
argument-hint: "<feature description> [--dry-run] [--team] [--no-team]"
allowed-tools: [Read, Write, Bash, Task, TeamCreate, SendMessage]
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

### Step 2: Determine execution mode and spawn dispatch agent

**Mode detection** (same resolution logic as tw:execute-phase):
```
--no-team flag → LEGACY (always wins)
--team flag    → TEAM
teamMode=legacy (project.json) → LEGACY
teamMode=team  (project.json) → TEAM
teamMode=auto  (project.json) → TEAM (single feature dispatch benefits from escalation)
```

**If TEAM mode:**
1. Generate team name: `tw-par-<feature-slug>-<timestamp>`
2. Call `TeamCreate(team_name="<teamName>", description="Parallel feature: <description>")`
3. Write `.threadwork/state/team-session.json` with `mode: "parallel"`, `featureSlug`, `worktreePath`
4. Calculate workerBudget: `floor(remainingBudget × 0.6 / 1)` (single worker)
5. Spawn dispatch with team marker:
   ```
   Task(
     subagent_type="tw-dispatch",
     prompt="[TEAM_MODE=true teamName=<N> workerBudget=<B>]
   Feature: <description>
   Worktree: <path>
   <specs>"
   )
   ```

**If LEGACY mode:**
Spawn `tw-dispatch` without team marker (existing behavior):
```
Task(
  subagent_type="tw-dispatch",
  prompt="Feature: <description>\nWorktree: <path>\n<specs>"
)
```

### Step 3: Monitor
- **Team mode**: Progress arrives as `SendMessage` events from dispatch — display each as it arrives (real-time)
- **Legacy mode**: Display progress updates as dispatch reports them (existing behavior)

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
