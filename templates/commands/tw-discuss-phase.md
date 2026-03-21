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
6. **Architectural rules to enforce** — patterns that must NEVER appear (e.g., "No console.log in src/", "Services cannot import from UI layer"). These become `grep_must_not_exist` / `import_boundary` spec rules.
7. **Patterns that must always be present** — required conventions (e.g., "All API routes must have rate-limit middleware"). These become `grep_must_exist` spec rules.
8. **Naming conventions** — required name shapes (e.g., "All hooks must start with `use`", "All service files end in `.service.ts`"). These become `naming_pattern` rules.
9. **Design files** — are there mockups, wireframes, or HTML prototypes to implement against? If yes, what fidelity is expected? (exact / structural / reference)
10. **Verification profile** — what type of project is this? (web-app / cli-tool / library / vscode-extension / electron-app / browser-extension / obsidian-plugin / custom)
11. **Autonomy preference** — should agents ask before retrying failures (supervised), retry with guidance (guided), or retry until done (autonomous)?
12. **Gaps or missing context** — are there known unknowns that might block implementation? (e.g., "Not sure how the payment webhook format looks")

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

## Enforcement Rules
<answers to Q6 — architectural must-not-exist patterns>
<answers to Q7 — required must-exist patterns>
<answers to Q8 — naming conventions>

## Design References
<answers to Q9 — mockup files and fidelity level>

## Verification Profile
<answers to Q10 — project type>

## Autonomy Level
<answers to Q11 — supervised / guided / autonomous>

## Known Gaps
<answers to Q12 — missing context or unknowns>
```

### Step 4: Update spec library
For any decisions that represent reusable patterns (e.g., "always use jose for JWT"), propose a spec update:
- Call spec-engine to create a proposal in `.threadwork/specs/proposals/`

For answers to Q6-Q8, auto-generate enforcement spec rules:
- If any rules were specified in Q6-Q8, create `.threadwork/specs/enforcement/phase-N-rules.md` with the corresponding rule types
- Use `grep_must_not_exist` for Q6, `grep_must_exist` for Q7, `naming_pattern` for Q8

For the verification profile (Q10), write the selection to `project.json` under `"verificationType"`.

For autonomy preference (Q11), write `"autonomyLevel": "supervised"|"guided"|"autonomous"` to `project.json`.

## Output on completion:
- Advanced: "Phase N context saved. Run /tw:plan-phase N to generate execution plans."
- Beginner: Full summary of what was captured + explanation of next steps.

## Error Handling
- No phase number: "Please provide a phase number. Example: /tw:discuss-phase 1"
- Invalid phase: "Phase <N> not found in ROADMAP.md. Run /tw:new-project to generate a roadmap first."
