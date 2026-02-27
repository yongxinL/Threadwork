---
name: tw:plan-phase
description: Generate detailed XML execution plans for a phase with token estimates and phase budget preview
argument-hint: "<phase-number>"
allowed-tools: [Read, Write, Bash, Task]
---

## Preconditions
- Phase number N must be provided.
- `.threadwork/state/phases/phase-N/CONTEXT.md` must exist — run `/tw:discuss-phase N` first.
- `.threadwork/state/REQUIREMENTS.md` must exist.
- `.threadwork/state/ROADMAP.md` must exist.

## Action

### Step 1: Show token estimate for planning
"Planning Phase N will use approximately 20K–40K tokens. Proceeding..."

### Step 2: Spawn planner subagent
Spawn `tw-planner` agent with:
- `.threadwork/state/REQUIREMENTS.md` contents
- `.threadwork/state/ROADMAP.md` phase N section
- `.threadwork/state/phases/phase-N/CONTEXT.md` contents
- Relevant spec files (injected by pre-tool-use hook)
- Instruction: generate plans in the XML format below

**Required plan XML format**:
```xml
<plan id="PLAN-N-1" phase="N" milestone="M">
  <title>Descriptive plan title</title>
  <requirements>REQ-001, REQ-003</requirements>
  <tasks>
    <task id="T-N-1-1">
      <description>Specific implementation task description</description>
      <files>src/components/Auth.tsx, src/hooks/useAuth.ts</files>
      <verification>TypeScript compiles, tests pass, no lint errors</verification>
      <done-condition>Auth flow completes end-to-end with valid JWT</done-condition>
      <token-estimate>12000</token-estimate>
    </task>
  </tasks>
  <dependencies>PLAN-N-2 depends on PLAN-N-1</dependencies>
</plan>
```

### Step 3: Plan validation
Spawn `tw-plan-checker` with the generated plans.
Checker validates across 6 dimensions:
1. Requirements coverage (all phase REQ-IDs addressed)
2. File target clarity (specific filenames, not "some file")
3. Verification criteria completeness (measurable, not vague)
4. Done conditions measurability
5. Dependency graph validity (no cycles)
6. Spec compliance (plans follow loaded specs)

Iterate up to 3 times if quality threshold not met. Show retry count.

### Step 4: Save plans
Save to `.threadwork/state/phases/phase-N/plans/PLAN-N-*.xml`
Save dependency graph to `.threadwork/state/phases/phase-N/deps.json`

### Step 5: Phase Budget Preview
Sum all `<token-estimate>` values from the approved plans.

**Advanced tier**:
```
── Phase N Budget Preview ──────────────────────────
Plans: <M> | Tasks: <T>
Estimated tokens: ~<total>K across <T> tasks
Session budget:   <budget>K
This phase:       <pct>% of your session budget
Status: <✅ Fits in one session | ⚠️ May span 2 sessions | 🚨 Spans 3+ sessions>
────────────────────────────────────────────────────
```

**Ninja tier**: One-line: "Phase N: ~<total>K tokens | <M> plans | <pct>% of budget"

## Error Handling
- Missing CONTEXT.md: "Run /tw:discuss-phase N first to capture phase preferences."
- Plan checker fails after 3 iterations: Show the issues and ask user how to proceed.
