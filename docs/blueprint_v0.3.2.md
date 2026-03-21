# Threadwork v0.3.2 — Update Blueprint

> **Version**: 0.3.2
> **Status**: Upgrade spec — applies to existing Threadwork projects
> **Prerequisite**: Threadwork v0.3.x already initialized
> **Upgrade command**: `threadwork update --to v0.3.2`

---

## Why This Update Exists: The Harness Engineering Gap Analysis

This upgrade is informed by OpenAI's "Harness Engineering: Leveraging Codex in an Agent-First World" article, which documents how 3 engineers built a 1M+ line production app with zero manual code over 5 months. A systematic comparison of their 9 core problems against Threadwork's capabilities revealed that while Threadwork excels at context management, token economics, and session continuity, it has significant gaps in **mechanical enforcement**, **semantic review**, **runtime verification**, **failure classification**, and **autonomous operation**.

The full analysis is documented in `docs/discuss/harness_engineering.md` (14-part discussion covering all 9 problems). This blueprint implements the highest-impact changes as 8 upgrades organized into 3 priority tiers.

### Key Architectural Insight

Threadwork v0.3.x specs are **advisory** — injected as context, agents trusted to follow them. OpenAI's constraints are **mechanical** — deterministic rules that fail the build. v0.3.2 bridges this gap by adding machine-checkable rules to specs, a compliance quality gate, and a failure classification system that improves the harness itself rather than just retrying.

### Design Principles for This Release

1. **Additive only** — no existing state files, specs, or handoffs are altered by the upgrade
2. **Progressive adoption** — each upgrade works independently; users can adopt incrementally
3. **Backward compatible** — specs without `rules` frontmatter continue to work unchanged
4. **Existing patterns** — follow the virtual-tool interception pattern (like `spec_fetch`), the quality gate registration pattern, and the entropy collector spawn pattern

---

## What Changes in v0.3.2

9 upgrades in 3 priority tiers. All changes are additive or in-place modifications.

| Tier | # | Upgrade | Key Files | New Commands |
|------|---|---------|-----------|-------------|
| **T1** | 1 | Spec Rules Engine + Compliance Gate | `lib/rule-evaluator.js` (new), `lib/quality-gate.js` | — |
| **T1** | 2 | Failure Classification + Fast-Track Proposals | `lib/quality-gate.js`, `hooks/subagent-stop.js` | — |
| **T1** | 3 | tw-reviewer Agent (Agent-to-Agent Review) | `templates/agents/tw-reviewer.md` (new) | — |
| **T2** | 4 | Doc-Freshness Gate + Knowledge Notes | `lib/doc-freshness.js` (new), `lib/knowledge-notes.js` (new) | `/tw:docs-health` |
| **T2** | 5 | Enhanced Discuss-Phase (10+2 Questions) | `templates/commands/tw-discuss-phase.md` | — |
| **T2** | 6 | Runtime Verification (Smoke Test + Profiles) | `lib/verification-profile.js` (new), `lib/quality-gate.js` | `/tw:verify-manual` |
| **T2** | 9 | Design Reference System | `lib/design-ref.js` (new), `lib/spec-engine.js` | — |
| **T3** | 7 | Capability Gap Detection + Readiness Audit | `lib/spec-engine.js` | `/tw:readiness` |
| **T3** | 8 | Autonomous Operation Mode | `lib/autonomy.js` (new) | `/tw:autonomy` |

**Tier 1** — Core enforcement loop. Must ship together as they form an integrated system.
**Tier 2** — Knowledge, verification, and design layer. Each upgrade is independent.
**Tier 3** — Proactive detection and autonomy. Builds on Tier 1+2 foundations.

---

## Tier 1: Core Enforcement Loop

### Upgrade 1: Spec Rules Engine + Compliance Gate

**Source**: Discussion Parts 4.1, 4.2, 4.3
**Problem addressed**: #5 (Architectural Coherence) — specs are advisory, agents can ignore them
**v0.3.x behavior**: Specs contain prose only. Quality gates check lint/type/test but not spec compliance.
**v0.3.2 behavior**: Specs can define machine-checkable `rules` in frontmatter. A new `spec-compliance` gate enforces them mechanically in the Ralph Loop.

#### 1.1 Spec frontmatter `rules` field

Specs gain an optional `rules` array. Existing specs without `rules` continue to work unchanged.

```yaml
---
domain: backend
specId: SPEC:auth-001
name: JWT Best Practices
tags: [auth, jwt]
rules:
  - type: grep_must_exist
    pattern: "RS256"
    files: "src/lib/auth*.ts"
    message: "JWT must use RS256 algorithm per SPEC:auth-001"
  - type: grep_must_not_exist
    pattern: "require\\(['\"]jsonwebtoken['\"]\\)"
    files: "src/**/*.{ts,js}"
    message: "Use jose library, not jsonwebtoken (SPEC:auth-001)"
  - type: import_boundary
    from: "src/services/**"
    cannot_import: ["src/ui/**", "src/components/**"]
    message: "Service layer cannot import from UI layer"
  - type: naming_pattern
    pattern: "^use[A-Z]"
    files: "src/hooks/**/*.ts"
    target: "export_names"
    message: "Hooks must start with 'use' prefix"
  - type: file_structure
    must_exist: ["src/services/*/index.ts"]
    message: "Services must have index.ts entry point"
---
```

5 rule types at launch (extensible):

| Type | What it checks | How |
|------|---------------|-----|
| `grep_must_exist` | Pattern MUST appear in matching files | `grep -r` with glob filter |
| `grep_must_not_exist` | Pattern must NOT appear | `grep -r` inverse |
| `import_boundary` | Files in `from` glob cannot import from `cannot_import` globs | Parse `import`/`require` statements |
| `naming_pattern` | Exported names in matching files must match regex | Parse exports, test regex |
| `file_structure` | Required file glob patterns must exist | Glob existence check |

#### 1.2 New module: `lib/rule-evaluator.js`

```javascript
/**
 * lib/rule-evaluator.js — Spec rule evaluation engine
 *
 * Evaluates machine-checkable rules from spec frontmatter against
 * the current working tree. Each rule type has a dedicated evaluator.
 * Returns structured violations with specId, file, message, and evidence.
 */

export function evaluateRules(rules, projectRoot)
// Returns: { passed: boolean, violations: Violation[] }
// Violation: { specId, ruleType, message, files: string[], evidence: string }

export function evaluateGrepMustExist(rule, projectRoot)
export function evaluateGrepMustNotExist(rule, projectRoot)
export function evaluateImportBoundary(rule, projectRoot)
export function evaluateNamingPattern(rule, projectRoot)
export function evaluateFileStructure(rule, projectRoot)
```

#### 1.3 New gate: `runSpecCompliance()` in `lib/quality-gate.js`

Combines spec rules + optional structural tests (`.threadwork/structural-tests/` directory):

```javascript
export async function runSpecCompliance(options = {}) {
  const rules = loadRulesFromSpecs(specsDir);
  const ruleResult = evaluateRules(rules, projectRoot);
  const structResult = await runStructuralTests(projectRoot);
  return {
    gate: 'spec-compliance',
    passed: ruleResult.passed && structResult.passed,
    violations: ruleResult.violations,
    structuralFailures: structResult.errors,
    skipped: rules.length === 0 && structResult.tests === 0
  };
}
```

Gate order becomes: `typecheck → lint → tests → spec-compliance → build → security`

Default config: `{ "spec-compliance": { "enabled": true, "blocking": true } }`

#### 1.4 Extend `buildRemediationBlock()` for spec violations

When spec-compliance fails, the remediation block includes the exact rule violated:

```javascript
{
  primary_violation: "SPEC:auth-001 rule violated: Use jose library, not jsonwebtoken",
  relevant_spec: "SPEC:auth-001 | backend/jwt-best-practices",
  fix_template: "Replace require('jsonwebtoken') with import { SignJWT } from 'jose'",
  learning_signal: "spec-rule:auth-001:grep_must_not_exist:jsonwebtoken"
}
```

#### 1.5 Structural test convention

Users can create `.threadwork/structural-tests/*.js` files for complex invariants:

```javascript
// .threadwork/structural-tests/no-circular-deps.js
export const name = 'No Circular Dependencies';
export const specId = 'SPEC:arch-001';
export async function check(projectRoot) {
  // Custom logic — run madge, depcheck, etc.
  return { passed: true }; // or { passed: false, errors: [...] }
}
```

#### Files to modify

| File | Action |
|------|--------|
| `lib/rule-evaluator.js` | **Create** — 5 rule type evaluators + `evaluateRules()` orchestrator |
| `lib/quality-gate.js` | Modify — add `runSpecCompliance()`, `runStructuralTests()`, register in `runAll()`, extend `buildRemediationBlock()` |
| `lib/spec-engine.js` | Modify — add `loadRulesFromSpecs()` to parse `rules` from frontmatter |
| `hooks/subagent-stop.js` | Modify — pass specEngine to `buildRemediationBlock()` for rule-aware remediation |
| `templates/specs/enforcement/` | **Create** — starter spec templates with example rules |

#### Tests

- `tests/unit/rule-evaluator.test.js` — each rule type evaluator, edge cases (empty globs, no matches)
- `tests/unit/quality-gate-compliance.test.js` — `runSpecCompliance()` with mock specs containing rules
- `tests/integration/spec-enforcement.test.js` — full flow: spec with rules → violating code → gate catches → remediation

---

### Upgrade 2: Failure Classification + Fast-Track Proposals

**Source**: Discussion Parts 6.1, 6.2, 6.3
**Problem addressed**: #1 (Underspecified Environments) — Ralph Loop retries without improving the harness
**v0.3.x behavior**: Every failure creates a spec proposal at confidence 0.3 regardless of failure type.
**v0.3.2 behavior**: Failures are classified by type. Classification drives proposal confidence, retry strategy, and gap reporting.

#### 2.1 New function: `classifyFailure()` in `lib/quality-gate.js`

```javascript
export function classifyFailure(gateResults, specEngine) {
  // Returns: { type, confidence, evidence, recommendation }
  // Types:
  //   'code_bug'                — agent made a fixable mistake → retry normally
  //   'knowledge_gap'           — agent didn't know about X → inject missing spec + propose at 0.5
  //   'missing_capability'      — agent needed unavailable tool → log gap, don't waste retries
  //   'architectural_violation' — agent broke undocumented rule → propose rule at 0.5
}
```

**Classification logic priority:**
1. Check if error relates to a spec that exists but wasn't fetched → `knowledge_gap`
2. Check if error matches an existing spec rule → `architectural_violation`
3. Check if error is about missing tool/resource → `missing_capability`
4. Default → `code_bug`

#### 2.2 New function: `wasSpecFetchedThisSession()` in `lib/spec-engine.js`

Track which specs were fetched via the existing `spec_fetch_log` in `token-log.json`:

```javascript
export function wasSpecFetchedThisSession(specId) {
  const log = readTokenLog();
  return (log.spec_fetch_log ?? []).some(entry => entry.specId === specId);
}
```

#### 2.3 Classification-aware Ralph Loop

In `hooks/subagent-stop.js`, after `buildRemediationBlock()`:

```javascript
const classification = classifyFailure(gateResult, specEngine);

// Attach to remediation log
remediationLog.push({
  iteration: retries,
  classification: classification.type,
  evidence: classification.evidence,
  ...existingFields
});

// Classification-aware behavior:
if (classification.type === 'knowledge_gap') {
  // Inject missing spec into THIS retry prompt
  const specContent = specEngine.fetchSpecById(relatedSpecId);
  correctionPrompt += `\n\nRELEVANT SPEC:\n${specContent}`;
}

if (classification.type === 'missing_capability') {
  // Don't waste retries — log gap and allow completion
  appendGapReport({ type: 'missing_capability', ... });
}
```

#### 2.4 Classification-aware proposal confidence

```
code_bug:              0.3 → 0.6 cap → human → 0.7 → Store  (unchanged)
knowledge_gap:         0.5 → 0.6 cap → human → 0.7 → Store  (faster)
architectural_violation: 0.5 + proposed rules → human → 0.7 → enforcement
missing_capability:    No proposal → gap report → handoff
```

Changes to `proposeSpecUpdate()` in `lib/spec-engine.js`:
- Accept `initialConfidence` option (default 0.3, knowledge_gap/architectural_violation use 0.5)
- Accept `proposedRules` option — embed machine-checkable rules in proposal frontmatter

#### 2.5 Gap reporting

New functions in `lib/state.js`:
- `appendGapReport(entry)` — write to `.threadwork/state/gap-report.json`
- `readGapReport()` — read all gap entries

New handoff Section 4b in `lib/handoff.js`:

```markdown
## 4b. Environment Gaps Detected

**Knowledge gaps** (2): Agent lacked context that exists in codebase
  - Custom AppError class not in routing map → Spec proposed at confidence 0.5

**Missing capabilities** (1): Agent needed tooling that doesn't exist
  - Attempted to run database seed command but no seed script exists
```

#### Files to modify

| File | Action |
|------|--------|
| `lib/quality-gate.js` | Modify — add `classifyFailure()` |
| `lib/spec-engine.js` | Modify — add `wasSpecFetchedThisSession()`, accept `initialConfidence` and `proposedRules` in `proposeSpecUpdate()` |
| `lib/state.js` | Modify — add `appendGapReport()`, `readGapReport()` |
| `lib/handoff.js` | Modify — add Section 4b (Environment Gaps) |
| `hooks/subagent-stop.js` | Modify — classification-aware retry, proposal, and gap reporting |

#### Tests

- `tests/unit/quality-gate-classify.test.js` — each classification path
- `tests/unit/handoff-gaps.test.js` — Section 4b generation

---

### Upgrade 3: tw-reviewer Agent (Agent-to-Agent Review)

**Source**: Discussion Problem 9
**Problem addressed**: #9 (Agent Review Bottleneck) — no semantic review, only structural
**v0.3.x behavior**: Ralph Loop checks lint/type/test. No semantic review of code logic or design.
**v0.3.2 behavior**: New tw-reviewer agent examines executor output for semantic correctness, spec intent compliance, design quality, and duplication before quality gates run.

#### 3.1 New agent: `templates/agents/tw-reviewer.md`

Role: Code Review Analyst (Sonnet-class)

**Inputs**: task_diff, task_spec (XML), relevant_specs, knowledge_notes, existing_utilities

**Review checklist** (5 checks that quality gates can't do):
1. **Requirement alignment** — does code satisfy the `<done-condition>`?
2. **Spec intent** — does code follow spec's recommended approach, not just avoid violations?
3. **Design quality** — hardcoded values, missing error handling, tight coupling?
4. **Duplication** — does new code duplicate existing utilities?
5. **Knowledge note check** — is code consistent with discovered knowledge?

**Output**: `{ "decision": "approve" | "request_changes", "issues": [...] }`

**Constraints**: Max 2 review iterations per task. Under 10,000 tokens. Skip lint/type/test concerns.

#### 3.2 Review configuration in `project.json`

```json
{
  "review": {
    "enabled": true,
    "mode": "selective",
    "triggers": {
      "fileCount": 3,
      "securityKeywords": true,
      "newFiles": true,
      "complexityHigh": true
    }
  }
}
```

Modes: `all` | `selective` (default) | `off`

#### 3.3 Integration in `hooks/subagent-stop.js`

Review runs **before** quality gates. Flow:

```
Executor completes → tw-reviewer (if triggers match) → quality gates (lint/type/test/spec-compliance)
```

On `request_changes`: send review feedback to executor, re-invoke. Max 2 review iterations before proceeding to gates.

#### 3.4 Helper: `scanExistingUtilities()` in `lib/quality-gate.js`

Scans `src/lib/`, `src/utils/`, `src/helpers/` for exported functions/classes. Returns list for duplication check input to reviewer.

#### Files to modify

| File | Action |
|------|--------|
| `templates/agents/tw-reviewer.md` | **Create** — code review analyst agent template |
| `hooks/subagent-stop.js` | Modify — add pre-gate review step, reviewer spawn, review iteration tracking |
| `lib/quality-gate.js` | Modify — expose `scanExistingUtilities()` |

#### Tests

- `tests/unit/reviewer-integration.test.js` — review triggering, iteration limits, feedback formatting
- `tests/integration/agent-review.test.js` — execute → review → feedback → revise → gates

---

## Tier 2: Knowledge & Verification Layer

### Upgrade 4: Doc-Freshness Gate + Knowledge Notes

**Source**: Discussion Parts 10.1, 10.2, 11.1-11.8
**Problems addressed**: #3 (Context Management — docs rot), #7 (Human Judgment — knowledge lost)
**v0.3.x behavior**: No staleness detection for specs. Agent-discovered knowledge dies with the session.
**v0.3.2 behavior**: New doc-freshness gate catches stale spec references mechanically. New knowledge_note virtual tool captures agent discoveries for future sessions.

#### 4.1 Doc-freshness gate: `lib/doc-freshness.js` (new module)

```javascript
export function checkDocFreshness(specsDir, projectRoot)
// Checks:
//   dead_reference (error, blocking) — spec references file that doesn't exist
//   dead_cross_reference (error, blocking) — spec references specId that doesn't exist
//   dead_library_reference (warning) — spec references library not in package.json
//   empty_rule_target (warning) — rule glob matches no files
//   age_staleness (warning) — spec old + >50% referenced files changed since
```

Registered in `runAll()` gate sequence after spec-compliance:
`typecheck → lint → tests → spec-compliance → doc-freshness → smoke-test → build → security`

#### 4.2 Spec staleness tracking in `hooks/post-tool-use.js`

After each file modification, check if any spec references the changed file. Write to `.threadwork/state/spec-staleness-tracker.json`. Read by doc-freshness gate and surfaced in handoff.

#### 4.3 Entropy collector category 7: Spec Staleness

Extend `templates/agents/tw-entropy-collector.md` with 7th scan category. When a wave modifies code, check if any specs covering that code need updating. Warning severity — queued for human review, never auto-updated.

#### 4.4 Knowledge note virtual tool

New `knowledge_note` tool intercepted by `hooks/pre-tool-use.js` (same pattern as `spec_fetch`):

```javascript
// Agent calls:
knowledge_note({
  category: 'setup',           // setup | api | edge_case | testing | workflow
  scope: 'tests/',             // file path or directory
  summary: 'Tests must run with --runInBand due to shared DB',
  evidence: 'Parallel run caused failures, sequential passes',
  critical: true               // if true, inject into same-session agents immediately
})
```

Stored in `.threadwork/state/knowledge-notes.json`. Module: `lib/knowledge-notes.js`.

#### 4.5 Knowledge notes in routing map

`buildRoutingMap()` includes scope-matching knowledge notes alongside specs:

```
── SPEC ROUTING MAP ─────────────────────────────────
Available specs:
  [SPEC:be-002]  backend/api-design      — API patterns

Implementation notes for this scope:
  ⚠ [KN-critical] tests/ — Tests must run with --runInBand (verified 2026-03-19)
─────────────────────────────────────────────────────
```

#### 4.6 Knowledge note lifecycle

```
Agent discovers → knowledge_note tool → knowledge-notes.json
  → critical: inject same-session
  → all: inject next session via session-start
  → survives 2+ sessions → auto-promote to spec proposal at confidence 0.5
  → human accepts → becomes permanent spec, subject to doc-freshness
```

#### 4.7 Handoff Section 4c: Implementation Knowledge Discovered

Lists all knowledge notes from the session, categorized by critical/non-critical/promoted.

#### 4.8 New command: `/tw:docs-health`

Dashboard showing spec freshness, reference integrity, rule target coverage, knowledge note health, cross-spec consistency.

#### 4.9 Discovery Protocol in executor/debugger templates

Add section to `templates/agents/tw-executor.md` and `templates/agents/tw-debugger.md` instructing agents to call `knowledge_note` when they discover something useful.

#### Files to modify

| File | Action |
|------|--------|
| `lib/doc-freshness.js` | **Create** — reference integrity, age staleness, cross-spec consistency |
| `lib/knowledge-notes.js` | **Create** — note CRUD, promotion, freshness, routing map integration |
| `lib/quality-gate.js` | Modify — add `runDocFreshness()` to gate sequence |
| `lib/spec-engine.js` | Modify — `trackSpecStaleness()`, `extractFileReferences()`, knowledge notes in `buildRoutingMap()`, `promoteKnowledgeNotes()` |
| `lib/handoff.js` | Modify — add Section 4c (Implementation Knowledge) |
| `hooks/pre-tool-use.js` | Modify — intercept `knowledge_note` virtual tool |
| `hooks/post-tool-use.js` | Modify — track spec staleness on file changes, track knowledge note freshness |
| `hooks/session-start.js` | Modify — inject critical knowledge notes, increment sessionsSurvived |
| `templates/agents/tw-executor.md` | Modify — add Discovery Protocol |
| `templates/agents/tw-debugger.md` | Modify — add Discovery Protocol |
| `templates/agents/tw-entropy-collector.md` | Modify — add category 7: Spec Staleness |
| `templates/commands/tw-docs-health.md` | **Create** — `/tw:docs-health` command |

#### Tests

- `tests/unit/doc-freshness.test.js` — dead references, cross-references, age staleness
- `tests/unit/knowledge-notes.test.js` — note lifecycle, promotion, freshness
- `tests/integration/doc-freshness.test.js` — code change → staleness → gate → remediation
- `tests/integration/knowledge-capture.test.js` — discovery → capture → inject → promote

---

### Upgrade 5: Enhanced Discuss-Phase (10+2 Questions)

**Source**: Discussion Parts 4.4, 9.3.1, Design Reference System (Upgrade 9)
**Problems addressed**: #5 (Architectural Coherence), #2 (QA Bottleneck), #7 (Human Judgment), UI/UX fidelity
**v0.3.x behavior**: Discuss-phase asks 5 questions (libraries, patterns, constraints, risks, out of scope).
**v0.3.2 behavior**: 12 questions. New questions capture enforcement rules, review criteria, verification environment, and design references. Answers auto-generate spec rules, verification profiles, and design ref specs.

#### 5.1 New questions

| # | Question | Feeds Into |
|---|----------|------------|
| 1-5 | (existing) | CONTEXT.md |
| **6** | Architectural boundaries — layers and dependency directions | Spec rules (`import_boundary`) |
| **7** | Forbidden patterns — libraries/approaches that must NOT be used | Spec rules (`grep_must_not_exist`) |
| **8** | Naming conventions — rules for files, exports, variables | Spec rules (`naming_pattern`) |
| **9** | Code review focus — acceptance criteria beyond tests | CONTEXT.md `## Review Criteria` → verifier |
| **10** | Verification environment — how project is validated (web app, CLI, plugin, library) | Verification profile in `project.json` → Upgrade 6 |
| **11** | Design references — do you have mockups, wireframes, or design files for this phase? (image files, HTML/CSS prototypes, Figma export paths) | CONTEXT.md `## Design References` → Upgrade 9 |
| **12** | Design fidelity level — must the implementation be pixel-perfect, structurally faithful, or just inspired by the design? | CONTEXT.md `## Design References` → design ref `fidelity` field |

#### 5.2 Auto-generate spec rules from answers

After user answers Q6-8, auto-create spec file (e.g., `specs/enforcement/phase-N-rules.md`) with machine-checkable rules. User reviews before planning.

#### 5.3 Auto-fill in guided/autonomous mode (Upgrade 8)

In guided mode: auto-fill from previous CONTEXT.md, only ask new questions. In autonomous mode: fully auto-fill, no questions.

#### Files to modify

| File | Action |
|------|--------|
| `templates/commands/tw-discuss-phase.md` | Modify — add questions 6-10, auto-generate spec rules, profile template loading |

---

### Upgrade 6: Runtime Verification (Smoke Test + Verification Profiles)

**Source**: Discussion Parts 9.1-9.7
**Problem addressed**: #2 (Human QA Bottleneck) — no runtime verification beyond lint/type/test
**v0.3.x behavior**: Quality gates are static analysis only.
**v0.3.2 behavior**: Smoke test gate (can the app start?), endpoint verification (do APIs respond correctly?), and verification profiles for non-web projects (Obsidian plugins, CLI tools, VS Code extensions, libraries).

#### 6.1 Smoke test gate: `runSmokeTest()` in `lib/quality-gate.js`

Auto-detects start/dev script from package.json. Starts app, waits for success signal or error, kills after 15s timeout. Zero configuration. Runs in Ralph Loop for web-app profiles.

#### 6.2 Endpoint verification: `runEndpointVerification()` in `lib/quality-gate.js`

Parses plan XML `<verification>` blocks for HTTP expectations. Actually executes HTTP checks against running app. Runs in verify-phase only (not Ralph Loop).

#### 6.3 Verification profiles: `lib/verification-profile.js` (new module)

Stored in `project.json` under `verification` key. Configured during discuss-phase Q10. Defines:
- `type`: web-app | cli-tool | library | obsidian-plugin | vscode-extension | browser-extension | electron-app | custom
- `build`: command + expected outputs
- `automated`: array of checks (json_schema, export_exists, command_runs, file_exists, grep_must_not_exist)
- `manual`: array of steps with expected outcomes and critical flag

Check types: `verifyJsonSchema()`, `verifyExports()`, `verifyCommandRuns()`, `verifyFilesExist()`, `verifyNoForbiddenPatterns()`

#### 6.4 Profile templates: `templates/verification-profiles/`

7 starter templates: web-app, cli-tool, library, obsidian-plugin, vscode-extension, browser-extension, electron-app. Loaded during discuss-phase Q10 and customized by user.

#### 6.5 Profile-aware UAT.md

Verifier generates UAT.md from verification profile `manual` steps + plan `<verification>` blocks. Project-type-aware, not generic.

#### 6.6 New command: `/tw:verify-manual`

Structured manual feedback. User reports pass/fail/skip for each manual check. Critical failures block phase completion. Failed checks become gap report entries. Recurring failures suggest automation.

#### 6.7 Gate execution strategy

```
Ralph Loop:    typecheck → lint → tests → spec-compliance → doc-freshness → smoke-test*
Verify-phase:  all Ralph Loop gates + endpoint-verification* + profile-verification + runtime-checks
Manual:        UAT.md + /tw:verify-manual (critical checks block phase completion)
```

*Only for applicable profile types.

#### 6.8 Flake tolerance

Extend `runTests()` with `flakyRetries` option. If test fails then passes on re-run without code changes, mark as flaky. Track in `.threadwork/state/flaky-tests.json`.

#### Files to modify

| File | Action |
|------|--------|
| `lib/verification-profile.js` | **Create** — profile loader, check runner, manual check tracker |
| `lib/quality-gate.js` | Modify — `runSmokeTest()`, `runEndpointVerification()`, `runProfileChecks()`, flaky retry logic |
| `templates/verification-profiles/` | **Create** — 7 starter profile templates |
| `templates/commands/tw-verify-manual.md` | **Create** — `/tw:verify-manual` command |
| `templates/commands/tw-verify-phase.md` | Modify — profile-aware UAT.md generation |
| `templates/agents/tw-verifier.md` | Modify — use profile, include manual results |

#### Tests

- `tests/unit/verification-profile.test.js` — profile loading, each check type
- `tests/unit/quality-gate-smoke.test.js` — smoke test, endpoint verification, flake detection
- `tests/integration/runtime-verification.test.js` — profile detection, gate execution, manual feedback

---

### Upgrade 9: Design Reference System

**Source**: UI/UX fidelity gap — agents have no way to receive, interpret, or verify against visual design assets
**Problem addressed**: Frontend implementation drifts from intended design because agents never see the mockup. Design intent is lost between the designer and the coding agent.
**v0.3.x behavior**: No support for design assets. Agents implement UI from text descriptions only, with no visual reference.
**v0.3.2 behavior**: Design files (images, HTML/CSS prototypes) are first-class references in specs, plans, and executor context. Agents read design files before implementing UI tasks. Reviewer compares output against design reference.

#### 9.1 Design reference concept

A **design reference** is a pointer to a file that represents the intended visual output for a component, page, or layout. Supported formats:

| Format | How agents use it | Best for |
|--------|------------------|----------|
| **Image** (PNG, JPG, WebP) | Claude reads the image visually via the Read tool (multimodal) | Figma exports, screenshots, hand-drawn wireframes |
| **HTML/CSS** | Claude reads the markup and understands structure, spacing, colors, class names | Interactive prototypes, design system demos, component sandboxes |
| **SVG** | Claude reads as XML — structure and layout are explicit | Icons, diagrams, simple layouts |

Design references live in the project (e.g., `designs/`, `mockups/`, or co-located with components). Threadwork never copies or moves them — it only stores pointers.

#### 9.2 Spec frontmatter `design_refs` field

Specs gain an optional `design_refs` array. Existing specs without it continue to work unchanged.

```yaml
---
domain: frontend
specId: SPEC:fe-login-001
name: Login Page Design
tags: [ui, auth, login]
design_refs:
  - path: designs/login-page.png
    label: Login page — desktop layout
    scope: src/app/login/**
    fidelity: exact           # exact | structural | reference
  - path: designs/login-mobile.png
    label: Login page — mobile breakpoint
    scope: src/app/login/**
    fidelity: structural
  - path: designs/login-prototype.html
    label: Login page — interactive HTML prototype with final CSS
    scope: src/app/login/**
    fidelity: exact
rules:
  - type: grep_must_exist
    pattern: "login-form"
    files: "src/app/login/**/*.tsx"
    message: "Login form must use class 'login-form' per design spec"
---

# Login Page Design Spec

## Layout
The login page uses a centered card layout...
```

**Fields per design ref entry:**

| Field | Required | Description |
|-------|----------|-------------|
| `path` | Yes | Relative path from project root to the design file |
| `label` | Yes | Human-readable description of what this file shows |
| `scope` | Yes | Glob pattern — which source files this design applies to |
| `fidelity` | No | `exact` (pixel-perfect), `structural` (same layout/hierarchy, flexible styling), `reference` (inspiration only). Default: `structural` |

#### 9.3 New module: `lib/design-ref.js`

```javascript
/**
 * lib/design-ref.js — Design reference resolution, validation, and injection
 *
 * Resolves design references from spec frontmatter, validates that referenced
 * files exist, and builds injection blocks for executors and reviewers.
 */

export function loadDesignRefs(specsDir, projectRoot)
// Scans all specs for design_refs frontmatter. Returns flat array of
// { specId, path, absolutePath, label, scope, fidelity, exists }

export function resolveDesignRefsForFiles(designRefs, taskFiles)
// Given a task's file list, find all design refs whose scope matches.
// Returns: DesignRef[] sorted by fidelity (exact first)

export function validateDesignRefs(designRefs, projectRoot)
// Check that all referenced design files exist on disk.
// Returns: { valid: DesignRef[], missing: { specId, path, label }[] }

export function buildDesignInjectionBlock(matchedRefs, projectRoot)
// Build a context block for executor/reviewer injection.
// For images: returns instruction to Read the file path (agent reads it visually)
// For HTML/CSS: returns a truncated preview (first 200 lines) + full path
// For SVG: returns full content if <500 lines, else path
// Returns: string (markdown block)

export function buildDesignReviewBlock(matchedRefs)
// Build a checklist for tw-reviewer to compare implementation against design.
// Returns: string (markdown checklist with fidelity-appropriate checks)
```

#### 9.4 Design refs in the routing map

`buildRoutingMap()` in `lib/spec-engine.js` includes design ref summaries alongside specs:

```
── SPEC ROUTING MAP ─────────────────────────────────
Available specs:
  [SPEC:fe-login-001]  frontend/login-design  — Login page layout + auth form

Design references for this scope:
  🎨 [SPEC:fe-login-001] designs/login-page.png — Login page desktop (exact fidelity)
  🎨 [SPEC:fe-login-001] designs/login-prototype.html — Interactive prototype (exact fidelity)
  Use spec_fetch SPEC:fe-login-001 to load spec + design reference paths
─────────────────────────────────────────────────────
```

Token cost: ~15 tokens per design ref line in routing map (pointer only, not content).

#### 9.5 Design ref injection in executor context

When the executor fetches a spec via `spec_fetch`, the pre-tool-use hook checks for `design_refs` in the fetched spec. If present and scope-matching:

1. **Images**: Inject an instruction block telling the executor to Read the image file before implementing:
   ```markdown
   ── DESIGN REFERENCES ────────────────────────────────
   ⚠ Read these design files BEFORE implementing. Match your output to them.

   📐 designs/login-page.png (exact fidelity — pixel-perfect match required)
     → Read this file to see the intended desktop layout

   📐 designs/login-prototype.html (exact fidelity)
     → Read this file for exact CSS classes, spacing, colors, and structure
     → Preview (first 50 lines):
     [truncated HTML preview here]

   Fidelity guide:
     exact: Match layout, spacing, colors, typography, class names precisely
     structural: Match component hierarchy and layout flow; styling may differ
     reference: Use as inspiration; structure and style are flexible
   ─────────────────────────────────────────────────────
   ```

2. **HTML/CSS files**: Additionally include a truncated preview (first 50 lines) so the agent has immediate context without a separate Read call. The full path is provided for deeper inspection.

3. The executor is **not forced** to call Read — the injection block is advisory. But the instruction is strong: "Read these design files BEFORE implementing."

Implementation in `hooks/pre-tool-use.js`:

```javascript
// After spec_fetch interception, check for design_refs
import { resolveDesignRefsForFiles, buildDesignInjectionBlock } from '../lib/design-ref.js';

// Inside spec_fetch handler:
const spec = specEngine.fetchSpecById(specId);
const designRefs = spec.data?.design_refs ?? [];
if (designRefs.length > 0) {
  const taskFiles = getCurrentTaskFiles(); // from checkpoint or plan context
  const matched = resolveDesignRefsForFiles(designRefs, taskFiles);
  if (matched.length > 0) {
    const designBlock = buildDesignInjectionBlock(matched, projectRoot);
    injectionContent += '\n' + designBlock;
  }
}
```

#### 9.6 Design refs in plan XML

Planner (Upgrade 5 Q11-12 feeds context) generates `<design-refs>` in task XML when applicable:

```xml
<task id="T-3-1-2">
  <description>
    Implement the login page layout matching the provided design mockup.
    Use the centered card pattern with the form fields shown in the design.
  </description>
  <files>src/app/login/page.tsx, src/app/login/login-form.tsx, src/app/login/login.css</files>
  <design-refs>
    <ref specId="SPEC:fe-login-001" path="designs/login-page.png" fidelity="exact" />
    <ref specId="SPEC:fe-login-001" path="designs/login-prototype.html" fidelity="exact" />
  </design-refs>
  <verification>
    Visual structure matches designs/login-page.png.
    CSS classes match those in designs/login-prototype.html.
    Form renders with email, password fields, and submit button.
  </verification>
  <done-condition>
    Login page renders a centered card with form matching the design reference.
  </done-condition>
  <token-estimate>25000</token-estimate>
</task>
```

The planner reads `CONTEXT.md ## Design References` (from discuss-phase Q11-12) and cross-references spec `design_refs` to populate `<design-refs>` in tasks that touch matching files.

#### 9.7 Design-aware tw-reviewer checks

Upgrade 3 (tw-reviewer) gains a 6th review check when design refs are present:

**Existing checks (1-5)**: requirement alignment, spec intent, design quality, duplication, knowledge note check

**New check 6: Design fidelity**
- Read each referenced design file (image or HTML/CSS)
- Compare the executor's output against the design reference
- Check based on fidelity level:
  - `exact`: layout structure, CSS class names, spacing values, color values, typography, component hierarchy must match
  - `structural`: component hierarchy and layout flow must match; colors/spacing/typography can differ
  - `reference`: only flag if output contradicts the design intent entirely
- Report issues as: `{ "check": "design_fidelity", "ref": "designs/login-page.png", "fidelity": "exact", "issues": [...] }`

In `templates/agents/tw-reviewer.md`, add to review checklist:

```markdown
6. **Design fidelity** (when design refs present) — does the implementation match the referenced design?
   - Read each design reference file listed in the task's `<design-refs>`
   - For `exact` fidelity: verify layout, class names, colors, spacing match
   - For `structural` fidelity: verify component hierarchy and flow match
   - For `reference` fidelity: only flag outright contradictions
   - Compare HTML structure and CSS against HTML/CSS prototypes when available
```

#### 9.8 Design ref validation in doc-freshness gate

Upgrade 4 (doc-freshness gate) gains a new check type:

```javascript
// In lib/doc-freshness.js:
// New check: dead_design_reference (error, blocking)
// — spec references a design file path that doesn't exist on disk
```

This uses `validateDesignRefs()` from `lib/design-ref.js`. Missing design files are reported as blocking errors — if the design file was deleted but the spec still references it, the gate catches it.

#### 9.9 Design refs in discuss-phase output

When the user answers Q11-12, `CONTEXT.md` gains a new section:

```markdown
## Design References
**Fidelity**: exact (pixel-perfect implementation required)

| File | Description | Scope | Fidelity |
|------|-------------|-------|----------|
| designs/login-page.png | Desktop login layout | src/app/login/** | exact |
| designs/login-mobile.png | Mobile login layout | src/app/login/** | structural |
| designs/login-prototype.html | HTML/CSS prototype with final styles | src/app/login/** | exact |

**Notes**: Colors and spacing from the HTML prototype take precedence over the PNG screenshot.
```

If the user provides design files, auto-generate a design spec proposal in `.threadwork/specs/proposals/frontend/phase-N-design.md` with the `design_refs` frontmatter pre-filled.

#### 9.10 Design ref spec template

New starter template at `templates/specs/frontend/design-ref.md`:

```yaml
---
domain: frontend
specId: SPEC:fe-design-CHANGE_ME
name: Component Design Reference
tags: [ui, design]
design_refs:
  - path: designs/CHANGE_ME.png
    label: Describe what this design shows
    scope: src/components/CHANGE_ME/**
    fidelity: structural
---

# Component Design Reference

## Design intent
Describe the overall design goal — what should this look like and feel like?

## Key visual elements
- List specific visual requirements the design mandates
- Colors, typography, spacing values if known

## Responsive behavior
- Describe breakpoints or responsive expectations from the design

## Interaction states
- Hover, focus, active, disabled, loading states shown in design
```

#### Files to modify

| File | Action |
|------|--------|
| `lib/design-ref.js` | **Create** — `loadDesignRefs()`, `resolveDesignRefsForFiles()`, `validateDesignRefs()`, `buildDesignInjectionBlock()`, `buildDesignReviewBlock()` |
| `lib/spec-engine.js` | Modify — include design ref summaries in `buildRoutingMap()` |
| `lib/doc-freshness.js` | Modify — add `dead_design_reference` check using `validateDesignRefs()` |
| `hooks/pre-tool-use.js` | Modify — inject design ref block after `spec_fetch` when design_refs present |
| `templates/commands/tw-discuss-phase.md` | Modify — add Q11 (design files), Q12 (fidelity level), auto-generate design spec proposals |
| `templates/agents/tw-planner.md` | Modify — read design refs from CONTEXT.md, generate `<design-refs>` in task XML |
| `templates/agents/tw-reviewer.md` | Modify — add check 6 (design fidelity) |
| `templates/agents/tw-executor.md` | Modify — add Design Reference Protocol (read design files when injection block present) |
| `templates/agents/tw-verifier.md` | Modify — add design fidelity as verification dimension |
| `templates/specs/frontend/design-ref.md` | **Create** — starter design ref spec template |

#### Tests

- `tests/unit/design-ref.test.js` — `loadDesignRefs()`, `resolveDesignRefsForFiles()` scope matching, `validateDesignRefs()` missing file detection, `buildDesignInjectionBlock()` output for each format (image, HTML, SVG), `buildDesignReviewBlock()` fidelity-appropriate checklists
- `tests/unit/spec-engine-design.test.js` — routing map includes design ref lines, token cost stays within budget
- `tests/integration/design-ref-flow.test.js` — end-to-end: spec with design_refs → discuss-phase captures refs → planner generates `<design-refs>` in task XML → executor receives injection block → reviewer checks design fidelity

---

## Tier 3: Proactive Detection & Autonomy

### Upgrade 7: Capability Gap Detection + Readiness Audit

**Source**: Discussion Parts 8.1-8.3, 12.1-12.2
**Problems addressed**: #1 (Underspecified Environments), #6 (Garbage Collection trends)
**v0.3.x behavior**: No proactive detection of codebase gaps. Entropy collector has no trend tracking.
**v0.3.2 behavior**: Readiness audit scans codebase for agent-unfriendly patterns. Pre-execution gap scanner checks plans against spec coverage. Gap aggregation across sessions. Entropy trend tracking.

#### 7.1 Readiness audit: `auditHarnessReadiness()` in `lib/spec-engine.js`

Scans for: custom base classes, utility directories, non-standard scripts, import aliases, env variables, monorepo structures — all without spec coverage. Produces coverage score and gap list.

Auto-generate draft specs for fixable gaps: `/tw:readiness --fix`

#### 7.2 Pre-execution gap scanner: `scanPlanForGaps()` in `lib/spec-engine.js`

Before `/tw:execute-phase`, scan plan file targets against specs. Warn about uncovered directories, undocumented patterns, unknown libraries. Inject directory READMEs as context fallback.

Runs as Step 1.5 in execute-phase (after budget check, before loading plans).

#### 7.3 Gap aggregation: `aggregateGaps()` in `lib/state.js`

Group gaps by fingerprint across sessions. Priority: 3+ occurrences = high, 2 = medium, 1 = low. Auto-generate draft specs at 3+ occurrences. Inject high-priority warnings at session-start.

#### 7.4 Entropy trend tracking

New `updateTrends()` in `lib/entropy-collector.js`. Aggregate entropy reports into `.threadwork/state/entropy-trends.json`. Classify per-category direction (worsening/improving/stable). Auto-escalate worsening categories to spec rule proposals.

#### 7.5 On-demand entropy scan

New subcommand: `/tw:entropy scan [--since <sha|tag|date>]`. Runs entropy collector against any diff range. Reuses existing agent with different inputs.

#### 7.6 New command: `/tw:readiness`

Shows harness readiness report: coverage score, gaps by priority, auto-fixable count, recommendations.

#### Files to modify

| File | Action |
|------|--------|
| `lib/spec-engine.js` | Modify — `auditHarnessReadiness()`, `scanPlanForGaps()`, `generateDraftSpecForGap()` |
| `lib/state.js` | Modify — `aggregateGaps()` |
| `lib/entropy-collector.js` | Modify — `updateTrends()`, trend classification |
| `hooks/session-start.js` | Modify — inject recurring gap warnings |
| `hooks/post-tool-use.js` | Modify — call `updateTrends()` after entropy report |
| `templates/commands/tw-readiness.md` | **Create** — `/tw:readiness` command |
| `templates/commands/tw-analyze-codebase.md` | Modify — add readiness audit |
| `templates/commands/tw-execute-phase.md` | Modify — pre-execution gap scan (Step 1.5) |
| `templates/commands/tw-entropy.md` | Modify — add `scan` subcommand |

#### Tests

- `tests/unit/spec-engine-gaps.test.js` — readiness audit, plan gap scanner
- `tests/unit/state-gaps.test.js` — gap aggregation
- `tests/unit/entropy-trends.test.js` — trend tracking, worsening detection
- `tests/integration/gap-detection.test.js` — proactive audit + pre-execution scan + aggregation

---

### Upgrade 8: Autonomous Operation Mode

**Source**: Discussion Part 13
**Problem addressed**: Future-proofing — AI will do more, humans will review less
**v0.3.x behavior**: Human approves every step (~9 interaction points per phase).
**v0.3.2 behavior**: Three autonomy levels. Supervised (current), guided (~3 touchpoints), autonomous (~0 touchpoints per phase, review at milestone end).

#### 8.1 Autonomy levels

New setting in `project.json`: `"autonomyLevel": "supervised" | "guided" | "autonomous"`

| Behavior | Supervised | Guided | Autonomous |
|---|---|---|---|
| Discuss-phase | Ask all 10 | Auto-fill, ask new only | Fully auto-fill |
| Plan approval | Always ask | Auto-approve if checker passes | Auto-approve + auto-fix |
| Ralph Loop max retries | 5 | 8 | 10 (then skip-and-log) |
| Spec proposal auto-accept | 0.7 (human only) | 0.6 | 0.5 |
| Model switch policy | Per config | Auto | Auto |
| Manual verification | Immediate | Defer to milestone | Skip |
| Session chaining | Manual | Manual | Auto-handoff + auto-resume |
| Primary review point | Every step | Failures + milestone | Milestone audit only |

#### 8.2 New module: `lib/autonomy.js`

```javascript
export function getAutonomyLevel()           // read from project.json
export function getMaxRetries(level)          // 5 | 8 | 10
export function getAutoAcceptThreshold(level) // 0.7 | 0.6 | 0.5
export function shouldAutoApprovePlan(level, checkReport)
export function shouldAutoFillDiscuss(level, previousContext)
export function shouldDeferManualVerification(level)
export function shouldAutoChainSessions(level)
```

#### 8.3 Safety rails (all levels)

Never automatic regardless of autonomy level:
- Git push / PR creation
- Destructive operations (delete branches, reset, force-push)
- Security-sensitive changes (detected via keyword matching)
- Budget exceeding (handoff generated, autonomous auto-resumes but respects budget)
- Quality gate configuration changes
- Autonomy level changes (human only)

#### 8.4 Session chaining (autonomous only)

At 95% budget in autonomous mode: auto-generate handoff, write auto-resume marker. Next session-start detects marker and auto-resumes.

#### 8.5 Milestone audit as primary review point

In guided/autonomous mode, `/tw:audit-milestone` becomes the main human review point. Shows: phase results, automated verification, items requiring review, aggregated manual checks, knowledge notes, entropy trends, feedback capture.

#### 8.6 Human feedback capture: `/tw:feedback`

```
/tw:feedback "Always use AppError instead of Error in service layer"
  --scope src/services/
  --rule grep_must_not_exist "new Error("
```

Creates spec proposal at confidence 0.6 (human-provided). Integrates into milestone audit flow.

#### 8.7 Gate strictness CLI

```
/tw:autonomy gate security non-blocking
/tw:autonomy gate tests blocking
```

#### Files to modify

| File | Action |
|------|--------|
| `lib/autonomy.js` | **Create** — autonomy level logic, thresholds, auto-approval |
| `hooks/subagent-stop.js` | Modify — autonomy-aware retries, skip-and-log |
| `hooks/session-start.js` | Modify — auto-resume from marker |
| `hooks/post-tool-use.js` | Modify — auto-handoff at 95% budget |
| `hooks/pre-tool-use.js` | Modify — auto-approve model switches per level |
| `lib/spec-engine.js` | Modify — auto-accept per autonomy threshold |
| `templates/commands/tw-autonomy.md` | **Create** — `/tw:autonomy` command |
| `templates/commands/tw-feedback.md` | **Create** — `/tw:feedback` command |
| `templates/commands/tw-discuss-phase.md` | Modify — auto-fill per autonomy |
| `templates/commands/tw-plan-phase.md` | Modify — auto-approve per autonomy |
| `templates/commands/tw-execute-phase.md` | Modify — autonomy-aware execution |
| `templates/commands/tw-verify-phase.md` | Modify — auto-proceed, defer manual |
| `templates/commands/tw-audit-milestone.md` | Modify — enhanced audit + feedback capture |

#### Tests

- `tests/unit/autonomy.test.js` — level thresholds, auto-approval, session chaining
- `tests/integration/autonomous-flow.test.js` — full phase without human interaction

---

## Binding Constraints (Cross-Cutting, Tier 1+2)

**Source**: Discussion Parts 4.5, 4.6

This is not a standalone upgrade but a cross-cutting enhancement that integrates Upgrades 1, 3, 4, and 5:

### Plan-checker generates `<constraints>` XML

After validating plans, the plan-checker extracts applicable spec rules per plan's file targets and generates a `<constraints>` block:

```xml
<constraints generated-by="plan-checker" timestamp="...">
  <constraint specId="SPEC:auth-001" rule="grep_must_exist">
    Files matching src/lib/auth*.ts MUST contain pattern "RS256"
  </constraint>
</constraints>
```

### Executor receives constraints

`hooks/pre-tool-use.js` injects `<constraints>` from plan XML alongside the routing map. Executors see both advisory context (specs) and non-negotiable rules (constraints).

### Verifier checks constraint compliance

`templates/agents/tw-verifier.md` adds two new verification dimensions:
1. **Spec Rule Compliance** — `evaluateRules()` results
2. **Review Criteria** — check each criterion from CONTEXT.md `## Review Criteria`

### Files to modify

| File | Action |
|------|--------|
| `templates/agents/tw-plan-checker.md` | Modify — enhanced Dimension 6, binding constraint generation |
| `templates/agents/tw-executor.md` | Modify — document constraint awareness |
| `templates/agents/tw-verifier.md` | Modify — spec rule compliance + review criteria dimensions |
| `hooks/pre-tool-use.js` | Modify — inject constraints from plan XML |

---

## Updated Agent Roster (10 Agents)

| Agent | Model | Role | New/Modified |
|-------|-------|------|-------------|
| tw-planner | Opus | Generates XML plans | — |
| tw-researcher | Opus | Domain research | — |
| tw-executor | Sonnet | Implements tasks | Modified (constraint awareness, Discovery Protocol, Design Reference Protocol) |
| tw-verifier | Sonnet | Goal-backward verification | Modified (spec compliance, review criteria, profiles, design fidelity) |
| tw-plan-checker | Sonnet | Validates plans (6 dimensions) | Modified (binding constraints) |
| **tw-reviewer** | **Sonnet** | **Semantic code review** | **New** |
| tw-debugger | Opus | Hypothesis-driven debugging | Modified (Discovery Protocol) |
| tw-dispatch | Haiku | Parallel work coordinator | — |
| tw-spec-writer | Haiku | Extracts patterns → proposals | — |
| tw-entropy-collector | Haiku | Post-wave drift scan | Modified (category 7: Spec Staleness) |

---

## Updated Quality Gate Sequence

```
Ralph Loop:
  typecheck → lint → tests → spec-compliance → doc-freshness → smoke-test*

Verify-phase:
  all Ralph Loop gates + endpoint-verification* + profile-verification + runtime-checks

* profile-type dependent
```

Default config additions to `quality-config.json`:

```json
{
  "spec-compliance": { "enabled": true, "blocking": true },
  "doc-freshness": { "enabled": true, "blocking": true },
  "smoke-test": { "enabled": true, "blocking": true },
  "endpoint-verification": { "enabled": true, "blocking": false },
  "profile-verification": { "enabled": true, "blocking": true },
  "runtime-checks": { "enabled": true, "blocking": false }
}
```

---

## New State Files

| File | Format | Written By |
|------|--------|-----------|
| `.threadwork/state/gap-report.json` | JSON | `lib/state.js` — gap entries from classifier, pre-execution scan, entropy |
| `.threadwork/state/knowledge-notes.json` | JSON | `lib/knowledge-notes.js` — agent-discovered knowledge |
| `.threadwork/state/spec-staleness-tracker.json` | JSON | `hooks/post-tool-use.js` — specs affected by code changes |
| `.threadwork/state/entropy-trends.json` | JSON | `lib/entropy-collector.js` — per-category trend data |
| `.threadwork/state/flaky-tests.json` | JSON | `lib/quality-gate.js` — flaky test tracker |

All operational — added to `.gitignore` block.

---

## New Virtual Tools

| Tool | Intercepted By | Purpose |
|------|---------------|---------|
| `knowledge_note` | `hooks/pre-tool-use.js` | Agents capture implementation discoveries |

Extends existing virtual tool pattern (`spec_fetch`, `store_fetch`).

---

## New Commands

| Command | Upgrade | Purpose |
|---------|---------|---------|
| `/tw:docs-health` | 4 | Dashboard: spec freshness, reference integrity, knowledge note health |
| `/tw:verify-manual` | 6 | Structured manual verification feedback |
| `/tw:readiness` | 7 | Harness readiness audit: coverage score, gaps, recommendations |
| `/tw:autonomy` | 8 | Set autonomy level, configure gate strictness |
| `/tw:feedback` | 8 | Capture human review feedback as spec proposals |
| `/tw:entropy scan` | 7 | On-demand entropy scan against any diff range |

---

## Migration Path: `threadwork update --to v0.3.2`

The update command performs the following idempotent steps:

1. Copy new/updated hooks to `.threadwork/hooks/`
2. Copy new/updated lib modules to `.threadwork/lib/` (including `design-ref.js`)
3. Copy new agent templates to project's agent directory
4. Copy new command templates to project's command directory
5. Copy verification profile templates to `templates/verification-profiles/`
6. Copy enforcement spec templates to `.threadwork/specs/enforcement/`
7. Copy design ref spec template to `.threadwork/specs/frontend/` (if frontend domain exists)
8. Add new fields to `project.json` with defaults:
   - `review: { enabled: true, mode: "selective", triggers: {...} }`
   - `autonomyLevel: "supervised"`
   - `verification: null` (populated by discuss-phase Q10)
9. Add new gates to `quality-config.json` with defaults
10. Add new state files to `.gitignore` block
11. Create empty state files: `gap-report.json`, `knowledge-notes.json`, `entropy-trends.json`, `flaky-tests.json`

No existing state files, specs, journals, handoffs, or plans are altered.

---

## Complete Files Manifest

### New Files (27)

| File | Upgrade |
|------|---------|
| `lib/rule-evaluator.js` | 1 |
| `lib/doc-freshness.js` | 4 |
| `lib/knowledge-notes.js` | 4 |
| `lib/verification-profile.js` | 6 |
| `lib/design-ref.js` | 9 |
| `lib/autonomy.js` | 8 |
| `templates/agents/tw-reviewer.md` | 3 |
| `templates/commands/tw-docs-health.md` | 4 |
| `templates/commands/tw-verify-manual.md` | 6 |
| `templates/commands/tw-readiness.md` | 7 |
| `templates/commands/tw-autonomy.md` | 8 |
| `templates/commands/tw-feedback.md` | 8 |
| `templates/specs/enforcement/` | 1 |
| `templates/specs/frontend/design-ref.md` | 9 |
| `templates/verification-profiles/` (7 files) | 6 |
| `tests/unit/rule-evaluator.test.js` | 1 |
| `tests/unit/quality-gate-compliance.test.js` | 1 |
| `tests/unit/quality-gate-classify.test.js` | 2 |
| `tests/unit/doc-freshness.test.js` | 4 |
| `tests/unit/knowledge-notes.test.js` | 4 |
| `tests/unit/verification-profile.test.js` | 6 |
| `tests/unit/quality-gate-smoke.test.js` | 6 |
| `tests/unit/design-ref.test.js` | 9 |
| `tests/unit/spec-engine-design.test.js` | 9 |
| `tests/unit/spec-engine-gaps.test.js` | 7 |
| `tests/unit/state-gaps.test.js` | 7 |
| `tests/unit/entropy-trends.test.js` | 7 |
| `tests/unit/autonomy.test.js` | 8 |
| `tests/unit/reviewer-integration.test.js` | 3 |
| `tests/unit/handoff-gaps.test.js` | 2 |
| `tests/integration/spec-enforcement.test.js` | 1 |
| `tests/integration/agent-review.test.js` | 3 |
| `tests/integration/doc-freshness.test.js` | 4 |
| `tests/integration/knowledge-capture.test.js` | 4 |
| `tests/integration/runtime-verification.test.js` | 6 |
| `tests/integration/design-ref-flow.test.js` | 9 |
| `tests/integration/gap-detection.test.js` | 7 |
| `tests/integration/autonomous-flow.test.js` | 8 |

### Modified Files (28)

| File | Upgrades |
|------|----------|
| `lib/spec-engine.js` | 1, 2, 4, 7, 8, 9 |
| `lib/doc-freshness.js` | 4, 9 |
| `lib/quality-gate.js` | 1, 2, 3, 4, 6 |
| `lib/state.js` | 2, 7 |
| `lib/handoff.js` | 2, 4 |
| `lib/entropy-collector.js` | 7 |
| `hooks/subagent-stop.js` | 1, 2, 3, 4, 8 |
| `hooks/pre-tool-use.js` | 4, 8, 9, binding |
| `hooks/post-tool-use.js` | 4, 7 |
| `hooks/session-start.js` | 4, 7, 8 |
| `templates/commands/tw-discuss-phase.md` | 5, 8, 9 |
| `templates/commands/tw-plan-phase.md` | 8 |
| `templates/commands/tw-execute-phase.md` | 7, 8 |
| `templates/commands/tw-verify-phase.md` | 6, 8, binding |
| `templates/commands/tw-analyze-codebase.md` | 7 |
| `templates/commands/tw-entropy.md` | 7 |
| `templates/commands/tw-audit-milestone.md` | 8 |
| `templates/agents/tw-planner.md` | 9 |
| `templates/agents/tw-plan-checker.md` | binding |
| `templates/agents/tw-executor.md` | 4, 9, binding |
| `templates/agents/tw-debugger.md` | 4 |
| `templates/agents/tw-verifier.md` | 6, 9, binding |
| `templates/agents/tw-reviewer.md` | 3, 9 |
| `templates/agents/tw-entropy-collector.md` | 4 |
| `install/update.js` | migration |
| `bin/threadwork.js` | migration |
