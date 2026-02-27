---
name: tw:execute-phase
description: Execute all plans for a phase using parallel wave execution with spec injection and Ralph Loop quality gates
argument-hint: "<phase-number> [--wave <N>] [--plan <ID>] [--yolo]"
allowed-tools: [Read, Write, Edit, Bash, Task, TodoWrite]
---

## Preconditions
- Phase number N must be provided.
- Plan files must exist at `.threadwork/state/phases/phase-N/plans/PLAN-N-*.xml`
- Run `/tw:plan-phase N` first if plans don't exist.

## Action

### Step 1: Pre-execution budget check
Read token budget from `.threadwork/state/token-log.json`.
If budget < 20% remaining:
- Advanced: "⚠️ Token budget below 20%. This phase may not complete in this session. Continue? (yes/no)"
- Ninja: "⚠️ Budget < 20%. Continue? (yes/no)"
- Beginner: Full explanation of what this means and why it matters.

### Step 2: Load plans and build wave structure
1. Read all plan XMLs from `.threadwork/state/phases/phase-N/plans/`
2. Read `.threadwork/state/phases/phase-N/deps.json`
3. Topologically sort plans into parallel waves
4. Display wave structure:

```
Phase N Execution Plan:
  Wave 1 (parallel): PLAN-N-1, PLAN-N-2, PLAN-N-3
  Wave 2 (parallel): PLAN-N-4, PLAN-N-5
  Wave 3 (sequential): PLAN-N-6
Total: 6 plans, N tasks
```

If `--wave <W>` provided: execute only wave W.
If `--plan <ID>` provided: execute only that plan.

### Step 3: Execute each wave
For each wave:
1. Show token budget before starting
2. Spawn `tw-executor` agents in parallel via Task() for each plan in the wave
3. Each executor receives:
   - Its PLAN XML (from file)
   - Tech stack context (from project.json)
   - Relevant specs (injected by pre-tool-use hook automatically)
   - Git branch info

4. Monitor completion — wait for all plans in wave to complete before next wave
5. After wave completion, run spot check:
   - Read SUMMARY.md files written by executors
   - Verify commits were made: `git log --oneline -5`

### Step 4: Budget check between waves
After each wave, check token budget.
If budget crosses 80%: show warning.
If budget crosses 90%: "🚨 Budget critical. Consider running /tw:done and continuing next session."
If `--yolo` flag set: skip all interactive checkpoints, auto-continue.

### Step 5: Write execution log
Write `.threadwork/state/phases/phase-N/execution-log.json` with:
- Wave execution times
- Plan completion status
- Any errors encountered

## Error Handling
- Plan file missing: "Plan <ID> not found. Run /tw:plan-phase N to regenerate plans."
- Executor fails after Ralph Loop max retries: Show escalation message, mark plan as FAILED in execution log.
