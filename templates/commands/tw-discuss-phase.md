---
name: tw:discuss-phase
description: Capture developer preferences and decisions for a phase before planning begins
argument-hint: "<phase-number>"
allowed-tools: [Read, Write, Edit]
---

## Preconditions
- Phase number N must be provided as argument.
- `.threadwork/state/ROADMAP.md` must exist. If missing, run `/tw:new-project` first.
- `.threadwork/state/phases/phase-N/` directory will be created if needed.

## Action

### Step 1: Orient
Read `.threadwork/state/ROADMAP.md` and extract the phase N definition.
Display: "Phase N: <title> — <description>"

Check if a previous `CONTEXT.md` exists for this phase. If yes:
- Show a summary of previous context
- Ask only about changes: "This phase was discussed before. Any changes or new constraints since then?"

### Step 2: Ask targeted questions

Present questions relevant to this phase. Ask all at once, not one at a time:

1. **Preferred libraries/frameworks** for this phase's scope (e.g., "For the auth system: JWT via jose, session-based, or OAuth?")
2. **Patterns to follow** (e.g., "Repository pattern? Service layer? Direct DB calls?")
3. **Known constraints** (e.g., "Must use existing User table schema, no migrations allowed")
4. **Known risks** (e.g., "The legacy payment system has no test coverage")
5. **Out of scope** — anything that looks relevant but shouldn't be touched this phase

### Step 3: Record decisions
Generate `.threadwork/state/phases/phase-N/CONTEXT.md`:
```markdown
# Phase N Context

## Phase: <title>
**Discussed**: <date>

## Library/Framework Decisions
<answers to Q1>

## Patterns
<answers to Q2>

## Constraints
<answers to Q3>

## Known Risks
<answers to Q4>

## Out of Scope
<answers to Q5>
```

### Step 4: Update spec library
For any decisions that represent reusable patterns (e.g., "always use jose for JWT"), propose a spec update:
- Call spec-engine to create a proposal in `.threadwork/specs/proposals/`

## Output on completion:
- Advanced: "Phase N context saved. Run /tw:plan-phase N to generate execution plans."
- Beginner: Full summary of what was captured + explanation of next steps.

## Error Handling
- No phase number: "Please provide a phase number. Example: /tw:discuss-phase 1"
- Invalid phase: "Phase <N> not found in ROADMAP.md. Run /tw:new-project to generate a roadmap first."
