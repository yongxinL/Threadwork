---
name: tw:status
description: Show full project status dashboard — phase, milestone, active task, token budget, and quality gate state
argument-hint: "[set teamMode <legacy|auto|team>] [set maxWorkers <N|auto>]"
allowed-tools: [Read, Write, Bash, Glob, TaskList]
---

## Preconditions
- `.threadwork/state/project.json` must exist. If missing, tell the user to run `threadwork init`.

## Sub-commands

### `set` — Update project settings
```
/tw:status set teamMode <legacy|auto|team>
/tw:status set maxWorkers <N|auto>
```
Read `.threadwork/state/project.json`, update the specified field, write it back.
Confirm the change:
```
✓ teamMode updated: auto → team
  Next execution: /tw:execute-phase will use Team model by default
```
Valid values:
- `teamMode`: `legacy` | `auto` | `team`
- `maxWorkers`: `auto` | any integer 1–10

If no arguments, show the status dashboard (default behavior).

## Action (status dashboard)

Read the following files and compose a status dashboard:

1. `.threadwork/state/project.json` — project name, phase, milestone, active task, skill tier, teamMode
2. `.threadwork/state/token-log.json` — session budget, used, remaining
3. `.threadwork/state/checkpoint.json` — if exists, note recovery available
4. `.threadwork/state/ralph-state.json` — if exists, note pending quality gate retries
5. `.threadwork/state/active-task.json` — current task details
6. `.threadwork/state/team-session.json` — if active (status=active, not cleared, <2h old), show team info **plus** worker health (see Team Session section below)
7. Most recent file in `.threadwork/workspace/journals/` — last session summary

## Output Format

**Advanced/Ninja tier**: Compact table format:
```
── Threadwork Status ────────────────────────────────────
  Project:      <name>
  Phase:        <N> | Milestone: <N>
  Active task:  <task-id>: <description> (or None)
  Branch:       <git-branch>
  Token budget: <used>K / <total>K  (<pct>%)  [STATUS]
  Quality gates: PASS / FAIL / Not run
  Skill tier:   <tier>
  Team mode:    <legacy|auto|team>  (max workers: <N|auto>)
  Team session: <teamName> | Wave <W> | <N> workers active | <workerBudget>K each
                OR: None
  Checkpoint:   Available / None
─────────────────────────────────────────────────────────
```
Where [STATUS] is:
- ✅ Healthy (< 80%)
- ⚠️ Warning (80–90%)
- 🚨 Critical (> 90%)

Team session line only renders if `team-session.json` exists with `status=active`, not cleared, and started within the last 2 hours.

### Team Session Worker Health (when team session active)

After the compact table, if a team session is active:

1. Call `TaskList` to get live task statuses from the Claude Code team task list
2. Cross-reference with `workerLastSeen` from `team-session.json`
3. Print a per-worker health table:

```
Team Workers: tw-phase-2-1-12345678
  Worker                      Task Status     Last Heard    Plan Status
  tw-executor-plan-2-1        in_progress     2 min ago     PLAN-2-1 (3/5 tasks)
  tw-executor-plan-2-2        in_progress     1 min ago     PLAN-2-2 (1/3 tasks)
  tw-executor-plan-2-3        pending         18 min ago ⚠️  PLAN-2-3 (silent)
  tw-executor-plan-2-4        completed       8 min ago     PLAN-2-4 DONE ✓
```

Staleness indicators:
- < 5 min: no badge (healthy)
- 5–14 min: `(quiet)` — may be on a long-running task
- 15+ min: `⚠️  (silent)` — potentially stuck, orchestrator should ping
- 20+ min: `✗ (timed out)` — orchestrator marked as FAILED

If `workerLastSeen` is empty (no heartbeats received yet), show:
`  ⚠️ No worker heartbeats recorded — workers may not have confirmed startup`

**Beginner tier**: Add a "What this means" paragraph after the table explaining each item, including an explanation of the team mode setting.

## Error Handling
- If `.threadwork/state/project.json` missing: "Threadwork not initialized. Run `threadwork init` first."
- If `token-log.json` missing: show token status as "Not tracked yet"
- If git is unavailable: show branch as "unknown"
- If invalid `set` value provided: list valid options and exit without writing
