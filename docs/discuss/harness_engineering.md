# Harness Engineering: Analysis & Threadwork Gap Assessment

> Based on OpenAI's "Harness Engineering: Leveraging Codex in an Agent-First World" and related coverage.
> Discussion date: 2026-03-19

---

## Sources

- [OpenAI: Harness Engineering (via mirror)](https://jaytaylor.com/notes/node/1770842156000.html)
- [InfoQ: OpenAI Harness Engineering](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/)
- [Martin Fowler: Harness Engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html)
- [NxCode: Complete Guide](https://www.nxcode.io/resources/news/harness-engineering-complete-guide-ai-agent-codex-2026)
- [Eng Leadership Newsletter](https://newsletter.eng-leadership.com/p/how-openais-codex-team-works-and)

---

## Part 1: The 9 Core Problems & Threadwork's Position

OpenAI built a 1M+ line production app with zero manual code over 5 months (3 engineers, ~3.5 PRs/engineer/day). The article surfaces 9 core problems and resolutions.

### Problem 1: Underspecified Environments

**Challenge**: Early progress lagged not from agent capability gaps but insufficient tooling and abstractions in the repo.

**OpenAI Resolution**: Systems-first approach — break goals into building blocks, identify missing capabilities, make them "both legible and enforceable for the agent."

**Threadwork Status: Mostly Implemented**
- `/tw:new-project` scaffolds PROJECT.md, REQUIREMENTS.md, ROADMAP.md
- `/tw:analyze-codebase` maps brownfield repos
- Spec library provides domain knowledge
- Phase workflow (discuss -> plan -> execute -> verify) structures work

**Gap**: No automated **capability gap detection**. When an agent struggles, Threadwork doesn't automatically identify what's missing (tool, doc, guardrail) and feed fixes back into the repo. The Ralph Loop retries but doesn't systematically upgrade the environment.

---

### Problem 2: Human QA Bottleneck

**Challenge**: As agent throughput scaled, human QA became the limiting constraint.

**OpenAI Resolution**: Made the app UI legible to Codex (Chrome DevTools Protocol, DOM snapshots, screenshots). Exposed observability data (LogQL, PromQL). Agents ran 6+ hours autonomously.

**Threadwork Status: Partially Implemented**
- Ralph Loop automates quality gates (tsc, lint, tests, build, security)
- Agents self-correct up to 5 retries
- `/tw:verify-phase` does goal-backward verification
- Entropy collector catches cross-output drift

**Gap**: No runtime observability integration. Threadwork can't give agents access to logs, metrics, traces, or browser state. QA is limited to static analysis (lint/type/test). OpenAI's agents reproduce bugs from telemetry data.

---

### Problem 3: Context Management & Information Overload

**Challenge**: "One big AGENTS.md" failed. "Too much guidance becomes non-guidance. When everything is important, nothing is." Monolithic manuals "rot instantly."

**OpenAI Resolution**: AGENTS.md as table of contents (~100 lines). Structured `docs/` as system of record. Mechanical enforcement via linters. "Doc-gardening" agent for staleness.

**Threadwork Status: Well Implemented**
- **Progressive Disclosure** is first-class. Routing map (~150 tokens) acts as table of contents.
- On-demand `spec_fetch` retrieves full specs only when needed. Saves 20K-80K tokens per phase.
- Spec library organized by domain with YAML frontmatter.
- Session-start injection is compact (~orientation + budget + top-3 store entries).

**Gap**: No doc-gardening agent. Entropy collector scans code diffs but not documentation for staleness or cross-link validation. No mechanical enforcement that docs are up-to-date.

---

### Problem 4: Agent Legibility vs Human Readability

**Challenge**: Code optimized for human reading sometimes obscured intent from agents.

**OpenAI Resolution**: Optimize for agent legibility first. Treat repo as agent's onboarding doc. Favor "boring" tech. Reimplement over opaque dependencies. "Anything not in-context doesn't exist."

**Threadwork Status: Partially Addressed**
- Spec system + Store make project knowledge accessible in-context.
- Everything persists to `.threadwork/` — no state in env vars or human memory.
- Handoffs are self-contained (Section 10 has full resume prompt).

**Gap**: Threadwork doesn't guide users on making their codebase agent-legible. No tooling to audit agent comprehension factors (dependency transparency, in-repo docs completeness, opaque library detection). More of a consulting/guidance gap than a tooling gap.

---

### Problem 5: Architectural Coherence Without Manual Enforcement

**Challenge**: Agent-generated code replicates and compounds existing patterns, including bad ones.

**OpenAI Resolution**: Rigid layered architecture (Types -> Config -> Repo -> Service -> Runtime -> UI). Mechanical enforcement via custom linters. "By enforcing invariants, not micromanaging implementations, we let agents ship fast without undermining the foundation."

**Threadwork Status: Partially Implemented**
- Spec system can encode architectural patterns
- Quality gates run linters
- Entropy collector detects naming drift, import violations, duplicate logic
- Specs tagged `taste_invariant: true` enforced during entropy scans

**Gap: HIGH PRIORITY**. No structural/architectural test framework. Threadwork doesn't enforce dependency direction rules or layer boundaries mechanically. Specs are advisory — agents *can ignore them*. OpenAI uses deterministic linters that fail the build. This is the biggest philosophical gap.

---

### Problem 6: Technical Debt / Garbage Collection

**Challenge**: 20% of Fridays spent cleaning "AI slop". Manual garbage collection doesn't scale.

**OpenAI Resolution**: Encode golden principles as mechanical rules. Run background tasks on regular cadence — scan deviations, update quality grades, open targeted refactoring PRs. Automerge low-risk cleanup.

**Threadwork Status: Well Implemented**
- **Entropy Collector** is exactly this — background agent scanning wave diffs across 6 categories (naming drift, import violations, orphaned artifacts, doc staleness, inconsistent error handling, duplicate logic).
- Minor issues get auto-fix commits. Warning issues queue for next wave.

**Gap**: Entropy collector only runs post-wave, not on a regular cadence. No quality grade tracking over time. No automerge for low-risk cleanups. Could benefit from continuous garbage collection mode independent of phase workflow.

---

### Problem 7: Human Judgment Encoding

**Challenge**: Capturing subjective team preferences in a form agents can apply consistently.

**OpenAI Resolution**: Capture review comments as doc updates. Promote feedback into tooling. Inject custom linter error messages with remediation instructions.

**Threadwork Status: Well Implemented**
- **Spec Proposal Pipeline** with confidence escalation (0.3 -> 0.6 -> 0.7 -> Store)
- Ralph Loop learning signals automatically propose specs from failures
- Cross-session Store promotes patterns globally
- Remediation blocks include `relevant_spec` and `fix_template`

**Gap**: No automated capture from PR review comments. Human feedback during code review doesn't flow into spec proposals. Pipeline triggered by Ralph Loop failures, not human review patterns.

---

### Problem 8: PR Velocity vs Quality Gates

**Challenge**: Conventional blocking merge gates became counterproductive at agent throughput.

**OpenAI Resolution**: Minimal blocking merge gates. Short-lived PRs. "Corrections are cheap, waiting is expensive." Caveat: "This would be irresponsible in a low-throughput environment."

**Threadwork Status: Conservative Approach (Appropriate)**
- Ralph Loop is a blocking gate (up to 5 retries before escalation)
- Quality gates cache per git SHA
- Team model enables parallel execution

**Gap**: No configurable gate strictness. Can't mark certain gates as non-blocking or set "flake tolerance." For high-throughput teams this could become a bottleneck. Consider gate policies (blocking/warning/skip) per gate type.

---

### Problem 9: Agent Review Bottleneck

**Challenge**: Human review became throughput limitation.

**OpenAI Resolution**: Push "almost all review effort" to agent-to-agent. Humans instruct Codex to review its own changes, request additional reviews, iterate until all agent reviewers satisfied.

**Threadwork Status: Partially Implemented**
- Ralph Loop is self-review (quality gates)
- `/tw:verify-phase` is goal-backward verification
- Plan-checker validates plans across 6 dimensions
- Entropy collector reviews cross-output coherence

**Gap: HIGH PRIORITY**. No agent-to-agent review workflow. No dedicated review agent examining PRs for semantic correctness, design quality, or specification compliance. Current review is structural (lint/type/test), not semantic.

---

## Summary Scorecard

| # | Problem | Threadwork Status | Priority |
|---|---------|------------------|----------|
| 1 | Underspecified Environments | Mostly Implemented | Medium |
| 2 | Human QA Bottleneck (observability) | Partially Implemented | Low* |
| 3 | Context Management | **Well Implemented** | -- |
| 4 | Agent Legibility | Partially Addressed | Low |
| 5 | Architectural Enforcement | Partially Implemented | **High** |
| 6 | Garbage Collection | Well Implemented | Medium |
| 7 | Human Judgment Encoding | Well Implemented | Medium |
| 8 | PR Velocity vs Gates | Conservative | Low |
| 9 | Agent-to-Agent Review | Partially Implemented | **High** |

*Runtime observability requires deep integration with each user's stack — may be out of scope.

---

## Part 2: What Threadwork Does Better Than OpenAI's Approach

1. **Token Economics** — OpenAI never mentions token budgets, cost tracking, or variance analysis. Their agents run "6+ hours" with no visibility. Threadwork's budget system with 80/90/95% thresholds and per-task variance is a significant operational advantage.

2. **Session Continuity** — OpenAI assumes long-running single sessions. Threadwork's 10-section handoff with auto-populated decisions enables multi-session projects with no context loss.

3. **Progressive Disclosure** — OpenAI's "AGENTS.md as TOC" is a first step. Threadwork's routing map (~150 tokens) + on-demand spec_fetch with token tracking is more complete.

4. **Confidence-Gated Learning** — The 0.3 -> 0.6 -> 0.7 -> Store pipeline is genuinely novel. OpenAI encodes human judgment manually; Threadwork has an automated escalation path.

5. **Multi-Model Orchestration** — Threadwork assigns Opus/Sonnet/Haiku by task complexity. OpenAI uses a single model throughout.

---

## Part 3: Deep Dive — Advisory vs Mechanical Enforcement

### The Philosophical Divide

OpenAI's core insight:

> "By enforcing invariants, not micromanaging implementations, we let agents ship fast without undermining the foundation."

Their constraints are **deterministic and blocking** — a custom linter fails the build if code imports across layer boundaries. The agent has no choice but to comply.

Threadwork's approach: specs are **injected as context** and agents are trusted to follow them. The Ralph Loop catches violations *after the fact* via lint/type/test gates, but architectural rules like "service layer cannot import from UI" aren't enforced mechanically.

**Arguments for Threadwork's current approach:**
- Threadwork serves diverse codebases — can't assume a specific architecture
- Mechanical enforcement requires users to define rules upfront (high setup cost)
- The spec confidence pipeline is a softer feedback loop that learns over time

**Arguments for adding mechanical enforcement:**
- Advisory specs create a "soft ceiling" — agents can drift without consequence
- Ralph Loop only catches what lint/type/test catch — architectural violations that don't cause build failures slip through
- OpenAI's experience shows agents *will* compound bad patterns if not mechanically prevented

### Where Enforcement Currently Breaks Down

The pipeline has 4 enforcement points — all advisory:

| Stage | Enforcement Point | Type | Problem |
|---|---|---|---|
| **Plan** | plan-checker Dimension 6 "Spec Compliance" | Advisory | Checker flags violations but agent can ignore or misinterpret |
| **Execute** | Executor prompt: "never contradict spec library entries" | Prompt instruction | Relies on agent compliance. No verification. |
| **Execute** | Ralph Loop quality gates | Mechanical (lint/type/test) | Only catches structural violations. "Use jose not jsonwebtoken" isn't a lint rule. |
| **Verify** | Verifier reads specs + decisions | Advisory | Checks requirements coverage, not spec compliance. |

**The fundamental issue**: specs contain prose, not machine-checkable rules. A spec says "Use RS256 for JWT signing" but nothing mechanically verifies the code actually uses RS256.

---

## Part 4: Mechanical Enforcement Plan (Decision: 2026-03-19)

### User Decision

> "Even though we trust agents to follow specs, we still need a way to enforce and validate that rules are being followed. Since AI does the coding, we need to make sure the code follows the spec. We should invest more in the planning stage — more questions are worth it."

**Chosen approach**: Both combined (spec rules engine + structural test framework) with enhanced discuss-phase (9 questions including enforcement and review criteria).

### 4.1 Spec Rules Engine

Extend spec frontmatter with a `rules` array. 5 rule types:

| Type | What it checks | How |
|------|---------------|-----|
| `grep_must_exist` | Pattern MUST appear in matching files | `grep -r` with glob filter |
| `grep_must_not_exist` | Pattern must NOT appear | `grep -r` inverse |
| `import_boundary` | Files in `from` glob cannot import from `cannot_import` globs | Parse import statements |
| `naming_pattern` | Exported names must match regex | Parse exports, test regex |
| `file_structure` | Required file patterns must exist | Glob check |

Example spec with rules:
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
    message: "Service layer cannot import from UI layer (SPEC:arch-001)"
---
```

**Files**: New `lib/rule-evaluator.js`. Modified `lib/spec-engine.js` (add `loadRules()`).

### 4.2 Structural Test Gate

Convention: `.threadwork/structural-tests/` directory with JS files exporting `check(projectRoot)` for complex invariants (circular deps, custom business rules).

```javascript
// .threadwork/structural-tests/no-circular-deps.js
export const name = 'No Circular Dependencies';
export const specId = 'SPEC:arch-001';
export async function check(projectRoot) {
  // Run madge or custom logic
  const { execSync } = await import('child_process');
  try {
    execSync('npx madge --circular src/', { cwd: projectRoot });
    return { passed: true };
  } catch (e) {
    return { passed: false, errors: [`Circular dependencies found: ${e.stdout}`] };
  }
}
```

**Files**: Modified `lib/quality-gate.js` (add `runStructuralTests()`).

### 4.3 Spec Compliance Quality Gate

New gate `runSpecCompliance()` combining spec rules + structural tests. Registered in `runAll()`:

```
Gate order: typecheck → lint → tests → spec-compliance → build → security
```

Runs in Ralph Loop. On failure, `buildRemediationBlock()` produces rule-aware remediation:
```javascript
{
  primary_violation: "SPEC:auth-001 rule violated: Use jose library, not jsonwebtoken",
  relevant_spec: "SPEC:auth-001 | backend/jwt-best-practices",
  fix_template: "Replace require('jsonwebtoken') with import { SignJWT } from 'jose'",
  learning_signal: "spec-rule:auth-001:grep_must_not_exist:jsonwebtoken"
}
```

**Files**: Modified `lib/quality-gate.js`, `hooks/subagent-stop.js`.

### 4.4 Enhanced Discuss-Phase (9 Questions)

Current 5 questions + 4 new enforcement/review questions:

| # | Question | Purpose | Feeds into |
|---|----------|---------|------------|
| 1 | Preferred libraries/frameworks | Context | CONTEXT.md |
| 2 | Patterns to follow | Context | CONTEXT.md |
| 3 | Known constraints | Context | CONTEXT.md |
| 4 | Known risks | Context | CONTEXT.md |
| 5 | Out of scope | Context | CONTEXT.md |
| **6** | **Architectural boundaries** — "What layers exist and what are the allowed dependency directions?" | **Enforcement** | **Spec rules (import_boundary)** |
| **7** | **Forbidden patterns** — "Any libraries, patterns, or approaches that must NOT be used?" | **Enforcement** | **Spec rules (grep_must_not_exist)** |
| **8** | **Naming conventions** — "Any naming rules for files, exports, or variables?" | **Enforcement** | **Spec rules (naming_pattern)** |
| **9** | **Code review focus** — "What should code review focus on beyond passing tests? Acceptance criteria?" | **Verification** | **Verifier instructions in CONTEXT.md** |

Auto-generates spec rules from answers to Q6-8. Review criteria from Q9 stored in CONTEXT.md `## Review Criteria` section.

**Files**: Modified `templates/commands/tw-discuss-phase.md`.

### 4.5 Binding Constraints (Plan-Checker → Executor)

Plan-checker extracts applicable spec rules per plan's file targets and generates `<constraints>` XML:

```xml
<plan id="PLAN-1-2">
  ...
  <constraints generated-by="plan-checker" timestamp="...">
    <constraint specId="SPEC:auth-001" rule="grep_must_exist">
      Files matching src/lib/auth*.ts MUST contain pattern "RS256"
    </constraint>
    <constraint specId="SPEC:arch-001" rule="import_boundary">
      Files in src/services/** MUST NOT import from src/ui/**
    </constraint>
  </constraints>
</plan>
```

Injected into executor prompts via `pre-tool-use.js`. Verifier checks constraint compliance post-execution.

**Files**: Modified `templates/agents/tw-plan-checker.md`, `hooks/pre-tool-use.js`, `templates/agents/tw-verifier.md`.

### 4.6 Enhanced Verifier with Review Criteria

Two new verification dimensions:
1. **Spec Rule Compliance** — run `evaluateRules()` and report
2. **Review Criteria** — check each criterion from CONTEXT.md against code

**Files**: Modified `templates/agents/tw-verifier.md`, `templates/commands/tw-verify-phase.md`.

---

## Part 5: Deep Dive — The "Failure as Signal" Mental Model

### The Core Insight

> When agents struggle, treat it as a signal to identify missing components (tools, guardrails, documentation) and feed fixes back into the repository.

Threadwork's Ralph Loop treats failure as "try again harder" (up to 5 retries). OpenAI treats failure as "the environment is broken — fix the harness, not the agent." These are fundamentally different philosophies:

| | Threadwork (Ralph Loop) | OpenAI (Harness-First) |
|---|---|---|
| Agent fails | Retry with remediation hints | Ask: what's missing in the environment? |
| After max retries | Escalate to human | Improve tooling/docs/guardrails |
| Learning captured in | Spec proposals (confidence 0.3) | Repo-level infrastructure changes |
| Feedback target | Future agent runs | The harness itself |

Threadwork *partially* does this via spec proposals on failure. But proposals target *patterns* ("use JWT refresh rotation"), not *environment gaps* ("agents need a database migration helper tool").

### Why This Matters: The Compound Effect

Consider a concrete example. An executor is building an API endpoint and fails because:
- It doesn't know the project uses a custom error handler
- It writes `throw new Error(...)` instead of `throw new AppError(...)`
- Tests fail because the error middleware expects `AppError`

**Ralph Loop today:**
1. Tests fail → remediation block says "Fix test failure in error-handler.test.js"
2. Agent retries, maybe figures out `AppError` exists, maybe doesn't
3. Next session, a *different* executor hits the same problem
4. Spec proposal created at confidence 0.3 — but it's about the *pattern*, not the *gap*

**Harness-first approach:**
1. Tests fail → system asks: *why* did the agent not know about `AppError`?
2. Answer: there's no spec covering the error handling pattern
3. Action: auto-generate a spec with the pattern + a `grep_must_not_exist` rule for `throw new Error(`
4. Next session, every executor knows about `AppError` from the routing map, and the rule prevents the mistake mechanically

The difference is **where the fix lives**. Ralph Loop fixes the *output* (this code, this session). Harness-first fixes the *input* (the environment, permanently).

### Building Blocks Already in Threadwork

1. **Spec proposals from Ralph Loop** (`hooks/subagent-stop.js:219-231`) — failures create proposals at confidence 0.3. This *is* environment improvement, but slow and pattern-targeted.
2. **Learning signals** (`lib/quality-gate.js:buildRemediationBlock()`) — fingerprints for deduplication. Same signal 3+ times auto-escalates to 0.6. Captures "what went wrong" not "what was missing."
3. **Decision logging** (`lib/state.js:appendDecision()`) — executors log choices in `<decisions>` XML. Feeds into handoffs but not back into the harness.
4. **Entropy collector** (`lib/entropy-collector.js`) — scans for cross-output drift. Could extend to scan for recurring failure patterns.

### The Missing Piece: Failure Classification

When the Ralph Loop hits a failure, it should ask *why* before asking *how to fix it*.

---

## Part 6: Failure-as-Signal Implementation Plan (Decision: 2026-03-19)

Three complementary features that transform the Ralph Loop from "retry harder" to "improve the harness":

### 6.1 Failure Classification in the Ralph Loop

**What changes**: Add a classification step between failure detection and retry in `hooks/subagent-stop.js`. New `classifyFailure()` function in `lib/quality-gate.js`.

**The classifier examines the error to determine *why* it failed:**

```
Failure detected
    │
    ▼
What type of failure is this?
    │
    ├── code_bug (agent made a mistake)
    │     → Retry with remediation (current Ralph Loop behavior)
    │
    ├── knowledge_gap (agent didn't know about X)
    │     → Inject missing spec into retry prompt immediately
    │     → Auto-generate spec proposal at higher confidence
    │
    ├── missing_capability (agent couldn't do X)
    │     → Log as environment gap
    │     → Surface to user in handoff — don't waste retries
    │
    └── architectural_violation (agent broke a rule it wasn't told about)
          → Auto-generate spec RULE (not just prose)
          → Connects to mechanical enforcement system
```

**Classification logic** (new function in `lib/quality-gate.js`):

```javascript
export function classifyFailure(gateResults, specEngine) {
  const classification = {
    type: null,        // 'code_bug' | 'knowledge_gap' | 'missing_capability' | 'architectural_violation'
    confidence: 0,     // 0-1 how confident the classification is
    evidence: '',      // why we classified it this way
    recommendation: '' // what to do about it
  };

  const failed = gateResults.results.filter(r => !r.passed && !r.skipped);
  const errors = failed.flatMap(r => r.errors ?? r.failures ?? []);
  const errorText = errors.join('\n');

  // 1. Knowledge gap: error references something a spec covers
  //    but that spec was never fetched this session
  const relatedSpec = specEngine.findRelatedSpec?.(errorText);
  const specWasFetched = specEngine.wasSpecFetchedThisSession?.(relatedSpec);
  if (relatedSpec && !specWasFetched) {
    classification.type = 'knowledge_gap';
    classification.evidence = `Spec ${relatedSpec} covers this but was not fetched`;
    classification.recommendation = 'Boost routing map relevance for this spec';
    return classification;
  }

  // 2. Architectural violation: error matches an existing spec rule
  const ruleViolation = specEngine.checkRulesAgainstError?.(errorText);
  if (ruleViolation) {
    classification.type = 'architectural_violation';
    classification.evidence = `Violates rule in ${ruleViolation.specId}: ${ruleViolation.message}`;
    classification.recommendation = 'Strengthen rule enforcement or add missing rule';
    return classification;
  }

  // 3. Missing capability: agent tried to use unavailable tool/resource
  if (errorText.match(/command not found|ENOENT|not installed|no such file/i)) {
    classification.type = 'missing_capability';
    classification.evidence = 'Agent attempted to use unavailable tool or resource';
    classification.recommendation = 'Add tooling or document workaround';
    return classification;
  }

  // 4. Default: code bug (agent made a fixable mistake)
  classification.type = 'code_bug';
  classification.recommendation = 'Retry with remediation hints';
  return classification;
}
```

**How it changes the Ralph Loop** (`hooks/subagent-stop.js` lines ~189-240):

```javascript
// Current flow:
const remediation = buildRemediationBlock(gateResult, specEngine, tier);
// → always retry with same approach

// New flow:
const remediation = buildRemediationBlock(gateResult, specEngine, tier);
const classification = classifyFailure(gateResult, specEngine);

// Classification attached to remediation log
remediationLog.push({
  iteration: retries,
  timestamp: new Date().toISOString(),
  classification: classification.type,     // NEW
  evidence: classification.evidence,       // NEW
  primary_violation: remediation.primary_violation,
  relevant_spec: remediation.relevant_spec,
  learning_signal: remediation.learning_signal,
  proposal_queued: false
});

// Classification-aware retry:
if (classification.type === 'knowledge_gap') {
  // Inject the missing spec INTO THIS retry — don't wait for next session
  const specContent = specEngine.fetchSpecById?.(relatedSpecId);
  correctionPrompt += `\n\nRELEVANT SPEC (was not in your routing map):\n${specContent}`;
}

if (classification.type === 'missing_capability') {
  // Log gap, don't waste retries on something that can't be fixed
  appendGapReport({
    type: 'missing_capability',
    description: classification.evidence,
    recommendation: classification.recommendation,
    timestamp: new Date().toISOString()
  });
}
```

**What this gives us:**
- Every failure gets a `type` tag in the remediation log
- `knowledge_gap` failures get the missing spec injected *immediately* (not next session)
- `missing_capability` failures are flagged for humans rather than wasting retries
- Classification data flows into proposals (6.2) and handoffs (6.3)

**Files to modify:**
- `lib/quality-gate.js` — add `classifyFailure()` (~60 lines)
- `lib/spec-engine.js` — add `wasSpecFetchedThisSession()` (track via existing `spec_fetch_log`)
- `hooks/subagent-stop.js` — use classification in retry logic (~30 lines changed)
- `tests/unit/quality-gate-classify.test.js` — new test file for classification paths

---

### 6.2 Fast-Track Spec Proposals from Classified Failures

**What changes**: Currently every Ralph Loop failure creates a spec proposal at confidence 0.3 regardless of failure type (`hooks/subagent-stop.js:219-231`). With classification, proposals become smarter and faster.

**Classification-aware proposal strategy:**

```javascript
// In subagent-stop.js, after classifyFailure():

if (classification.type === 'knowledge_gap') {
  // Higher starting confidence — verified gap, not a guess
  proposeSpecUpdate(
    `gap/${specDomain}`,
    generateKnowledgeGapSpec(classification, remediation),
    remediation.learning_signal,
    {
      source: 'ralph-loop',
      learningSignal: remediation.learning_signal,
      initialConfidence: 0.5,         // starts higher than default 0.3
      failureType: 'knowledge_gap'
    }
  );
}

if (classification.type === 'architectural_violation') {
  // Propose a RULE, not just prose — ready for mechanical enforcement
  proposeSpecUpdate(
    `rule/${specDomain}`,
    generateRuleProposal(classification, remediation),
    remediation.learning_signal,
    {
      source: 'ralph-loop',
      learningSignal: remediation.learning_signal,
      initialConfidence: 0.5,
      failureType: 'architectural_violation',
      proposedRules: [{                // machine-checkable rule
        type: 'grep_must_not_exist',
        pattern: extractViolationPattern(classification),
        files: extractViolationFiles(classification),
        message: classification.evidence
      }]
    }
  );
}

if (classification.type === 'missing_capability') {
  // Don't pollute spec system — create gap report entry instead
  appendGapReport({
    type: 'missing_capability',
    description: classification.evidence,
    recommendation: classification.recommendation,
    timestamp: new Date().toISOString(),
    taskId: ralph.lastTaskId
  });
}

// code_bug: unchanged — standard proposal at 0.3
```

**Changes to proposeSpecUpdate()** (`lib/spec-engine.js:140`):

```javascript
// Current: always starts at 0.3
`confidence: 0.3`,

// New: respect initialConfidence from classified failures
`confidence: ${options.initialConfidence ?? 0.3}`,
```

When `proposedRules` is provided, embed them in the proposal frontmatter — ready to become mechanical enforcement when promoted:

```yaml
---
proposalId: 1711123456-rule-auth
specName: rule/auth
confidence: 0.5
source: ralph-loop
failureType: architectural_violation
proposedRules:
  - type: grep_must_not_exist
    pattern: "require\\(['\"]jsonwebtoken['\"]\\)"
    files: "src/**/*.ts"
    message: "Use jose library, not jsonwebtoken"
---
```

**The new confidence ladder:**

```
Current:
  All failures:          0.3 → (+0.1 per repeat) → 0.6 cap → human accepts → 0.7 → Store

New:
  code_bug:              0.3 → 0.6 cap → human → 0.7 → Store  (unchanged)
  knowledge_gap:         0.5 → 0.6 cap → human → 0.7 → Store  (faster — 2 repeats vs 3)
  architectural_violation: 0.5 + proposed rules → human → 0.7 → mechanical enforcement
  missing_capability:    No proposal → gap report → handoff  (doesn't pollute specs)
```

**Key insight**: This is the bridge between the advisory system and mechanical enforcement. Architectural violations come with *pre-built rules* — when the human accepts, enforcement is mechanical *immediately*.

**Files to modify:**
- `lib/spec-engine.js` — accept `initialConfidence` and `proposedRules` in `proposeSpecUpdate()`
- `hooks/subagent-stop.js` — classification-aware proposal logic
- `tests/unit/spec-engine.test.js` — test new proposal options

---

### 6.3 Gap Reporting in Handoffs

**What changes**: Add **Section 4b: Environment Gaps** to the 10-section handoff document, between "Key Decisions" and "Files Modified".

**New data source — gap-report.json** (new functions in `lib/state.js`):

```javascript
export function appendGapReport(entry) {
  const gapPath = join(process.cwd(), '.threadwork', 'state', 'gap-report.json');
  const existing = existsSync(gapPath)
    ? JSON.parse(readFileSync(gapPath, 'utf8'))
    : { gaps: [] };
  existing.gaps.push(entry);
  writeFileSync(gapPath, JSON.stringify(existing, null, 2), 'utf8');
}

export function readGapReport() {
  const gapPath = join(process.cwd(), '.threadwork', 'state', 'gap-report.json');
  if (!existsSync(gapPath)) return { gaps: [] };
  return JSON.parse(readFileSync(gapPath, 'utf8'));
}
```

Gap entries come from three sources:
1. **Failure classifier** (6.1) — `missing_capability` and `knowledge_gap` classifications
2. **Ralph Loop max retries** (`subagent-stop.js:173-186`) — when escalation happens, classify WHY and log it
3. **Entropy collector** — recurring patterns it detects but can't auto-fix

**Changes to handoff.js** (new Section 4b between lines ~183 and ~196):

Example output in handoff:

```markdown
## 4b. Environment Gaps Detected

**Knowledge gaps** (2): Agent lacked context that exists in codebase
  - Custom AppError class not in routing map → Spec proposed at confidence 0.5
  - Database migration naming convention unknown → Spec proposed at confidence 0.5

**Architectural violations** (1): Agent broke rules not yet enforced mechanically
  - Service imported from UI layer (src/services/user.ts → src/ui/Modal) → Rule proposed

**Missing capabilities** (1): Agent needed tooling that doesn't exist
  - Attempted to run database seed command but no seed script exists

**Recommended harness improvements**: Review gaps above and consider:
  - Accept spec proposals via /tw:specs proposals
  - Add missing tools or documentation
  - Add spec rules for recurring architectural violations
```

**The compound effect across sessions:**
- Session 1: "Agent didn't know about AppError" → spec proposed at 0.5
- Session 2: Same gap detected → confidence auto-bumps to 0.6
- Session 3: User accepts → spec active at 0.7 → future agents always know
- The gap *never happens again*

**Files to modify:**
- `lib/state.js` — add `appendGapReport()`, `readGapReport()`
- `lib/handoff.js` — add Section 4b between current sections 4 and 5
- `hooks/subagent-stop.js` — write gap entries on max retries escalation
- `tests/unit/handoff-gaps.test.js` — new test file

---

## Part 7: How Everything Connects (No Restructuring Required)

Options 1-3 (failure classification, fast-track proposals, gap reporting) and the enforcement plan (Part 4) are **complementary, not conflicting**. They slot into existing hooks and modules:

```
discuss-phase (9 questions → spec rules generated)             ← Part 4.4
    │
    ▼
plan-phase
    │ plan-checker validates against rules                     ← Part 4.5
    │ generates binding constraints per task                   ← Part 4.5
    │
    ▼
execute-phase
    │ executor receives binding constraints + routing map      ← Part 4.5
    │ executor implements task
    │
    ▼
ralph loop:
    ├── quality gates (lint/type/test + spec-compliance)       ← Part 4.3
    ├── classifyFailure()                                      ← Part 6.1 (NEW)
    ├── classification-aware proposals                         ← Part 6.2 (NEW)
    │     code_bug → standard proposal (0.3)
    │     knowledge_gap → fast-track proposal (0.5) + inject missing spec into retry
    │     architectural_violation → proposal with rules (0.5) → becomes enforcement on accept
    │     missing_capability → gap report entry (no proposal, no wasted retries)
    ├── gap report entries                                     ← Part 6.3 (NEW)
    └── retry (with injected missing spec if knowledge_gap)
    │
    ▼
verify-phase
    │ verifier checks requirements + spec rules + review criteria   ← Part 4.6
    │
    ▼
handoff
    │ Section 4: Key Decisions (existing)
    │ Section 4b: Environment Gaps (NEW)                       ← Part 6.3
    │     knowledge gaps → spec proposals to accept
    │     architectural violations → rules to enforce
    │     missing capabilities → tooling to add
    │ Section 5-10: (existing)
```

**The feedback loop**: Failure classifier (6.1) **feeds** the enforcement system (4.3). The enforcement system **prevents** the failures that the classifier would otherwise detect. Over time, the harness self-improves:

```
failure → classify → propose (spec or rule) → human accepts → enforce → failure prevented
```

### Files Summary (All Changes)

| File | Part | Action |
|------|------|--------|
| `lib/rule-evaluator.js` | 4.1 | **Create** — rule evaluation engine (5 types) |
| `lib/spec-engine.js` | 4.1, 6.2 | Modify — `loadRules()`, `wasSpecFetchedThisSession()`, `initialConfidence` support |
| `lib/quality-gate.js` | 4.3, 6.1 | Modify — `runSpecCompliance()`, `runStructuralTests()`, `classifyFailure()`, extend `runAll()` and `buildRemediationBlock()` |
| `lib/state.js` | 6.3 | Modify — `appendGapReport()`, `readGapReport()` |
| `lib/handoff.js` | 6.3 | Modify — add Section 4b |
| `hooks/subagent-stop.js` | 4.3, 6.1, 6.2, 6.3 | Modify — classification-aware retry, proposal, and gap reporting |
| `hooks/pre-tool-use.js` | 4.5 | Modify — inject `<constraints>` from plan XML |
| `templates/commands/tw-discuss-phase.md` | 4.4 | Modify — add questions 6-9, auto-generate spec rules |
| `templates/agents/tw-plan-checker.md` | 4.5 | Modify — enhanced Dimension 6, binding constraints |
| `templates/agents/tw-executor.md` | 4.5 | Modify — document constraint awareness |
| `templates/agents/tw-verifier.md` | 4.6 | Modify — spec rule compliance + review criteria dimensions |
| `templates/commands/tw-verify-phase.md` | 4.6 | Modify — load review criteria from CONTEXT.md |
| `templates/specs/enforcement/` | 4.1 | **Create** — starter spec templates with example rules |
| `tests/unit/rule-evaluator.test.js` | 4.1 | **Create** |
| `tests/unit/quality-gate-compliance.test.js` | 4.3 | **Create** |
| `tests/unit/quality-gate-classify.test.js` | 6.1 | **Create** |
| `tests/unit/handoff-gaps.test.js` | 6.3 | **Create** |
| `tests/integration/spec-enforcement.test.js` | 4.3, 6.1-6.3 | **Create** — end-to-end enforcement + classification flow |

No new hooks. No new agents. No structural changes to the pipeline.

---

## Part 8: Automated Capability Gap Detection (Discussion: 2026-03-20)

### The Problem

Problem 1 from the article: early progress lagged not from agent capability gaps but from insufficient tooling and abstractions in the repo itself. OpenAI's resolution: adopt a systems-first approach — when agents struggle, identify missing capabilities and make them "both legible and enforceable for the agent."

The failure classifier (Part 6.1) handles the **reactive** side — detecting gaps *after* agents fail. But the real insight is also **proactive**: identify missing capabilities *before* agents hit them.

```
                    PROACTIVE                              REACTIVE
                (before failure)                       (after failure)

  /tw:analyze-codebase    /tw:plan-phase          Ralph Loop failure
  /tw:new-project         pre-execution scan       classifier (Part 6.1)
        │                       │                        │
        ▼                       ▼                        ▼
  "Your codebase has      "This plan touches       "Agent failed because
   no spec for your        auth/ but no auth        it didn't know about
   custom error handler"   spec exists"             AppError"
```

Three proactive approaches, all feeding into the same `gap-report.json` designed in Part 6.3:

---

### 8.1 Codebase Readiness Audit

Threadwork already has `/tw:analyze-codebase` which maps brownfield repos and produces an architecture summary. But it doesn't assess **harness readiness** — whether the codebase is equipped for agent-driven development.

**Concept**: Scan the codebase and ask "if an agent had to work here, what would it stumble on?"

**What to scan for:**

| Signal | Detection Method | Gap Type |
|--------|-----------------|----------|
| Custom base classes (AppError, BaseService, etc.) | Grep for `class X extends` + check if covered by any spec | Knowledge gap |
| Custom middleware/decorators | Grep for common patterns (express middleware, decorators) | Knowledge gap |
| Internal utility libraries (`lib/`, `utils/`, `helpers/`) | Check if any spec references these directories | Knowledge gap |
| Non-standard scripts in package.json | Parse scripts beyond standard (test, build, start) | Missing capability awareness |
| Environment-specific setup (.env.example, docker-compose) | Check existence but no spec documenting setup | Knowledge gap |
| Import aliases (tsconfig paths, webpack aliases) | Parse tsconfig/webpack for path mappings not in specs | Knowledge gap |
| Monorepo structure (workspaces, packages/) | Detect workspace config, check for boundary specs | Architectural gap |
| Custom linter rules (.eslintrc custom rules) | Parse and check if rules are reflected in specs | Enforcement gap |

**New function in `lib/spec-engine.js`:**

```javascript
export function auditHarnessReadiness(projectRoot, allSpecs) {
  const gaps = [];
  const covered = [];

  // 1. Scan for custom base classes
  const classExtends = grepSync('class\\s+\\w+\\s+extends', projectRoot, '**/*.{ts,js}');
  for (const match of classExtends) {
    const className = match.match(/class\s+(\w+)/)?.[1];
    const hasCoverage = allSpecs.some(s =>
      s.content?.includes(className) || s.tags?.some(t => className.toLowerCase().includes(t))
    );
    if (!hasCoverage) {
      gaps.push({
        type: 'knowledge_gap',
        category: 'custom_base_class',
        detail: `${className} (${match.file})`,
        message: `Custom class "${className}" not documented in any spec — agents won't know its API or when to use it`,
        autoFixable: true  // can auto-generate a draft spec by reading the class
      });
    } else {
      covered.push(`${className} — covered by spec`);
    }
  }

  // 2. Scan for internal utility directories
  const utilDirs = ['lib', 'utils', 'helpers', 'shared', 'common', 'internal'];
  for (const dir of utilDirs) {
    const dirPath = join(projectRoot, 'src', dir);
    if (existsSync(dirPath)) {
      const hasCoverage = allSpecs.some(s =>
        s.rules?.some(r => r.files?.includes(`src/${dir}/`)) ||
        s.content?.includes(`src/${dir}`)
      );
      if (!hasCoverage) {
        gaps.push({
          type: 'knowledge_gap',
          category: 'utility_directory',
          detail: `src/${dir}/`,
          message: `Utility directory "src/${dir}/" not referenced in any spec — agents may reinvent existing utilities`,
          autoFixable: true  // can scan exports and generate a utility catalog spec
        });
      }
    }
  }

  // 3. Scan for non-standard package.json scripts
  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const standardScripts = ['test', 'build', 'start', 'dev', 'lint', 'format', 'prepare'];
    const customScripts = Object.keys(pkg.scripts ?? {})
      .filter(s => !standardScripts.includes(s));
    const undocumented = customScripts.filter(s =>
      !allSpecs.some(spec => spec.content?.includes(s))
    );
    if (undocumented.length > 0) {
      gaps.push({
        type: 'missing_capability_awareness',
        category: 'custom_scripts',
        detail: undocumented.join(', '),
        message: `${undocumented.length} custom scripts (${undocumented.slice(0, 3).join(', ')}${undocumented.length > 3 ? '...' : ''}) not documented — agents won't know they exist`,
        autoFixable: true  // can generate a workflow/tooling spec
      });
    }
  }

  // 4. Scan for import aliases
  const tsconfigPath = join(projectRoot, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      const paths = Object.keys(tsconfig.compilerOptions?.paths ?? {});
      const undocumented = paths.filter(p =>
        !allSpecs.some(s => s.content?.includes(p.replace('/*', '')))
      );
      if (undocumented.length > 0) {
        gaps.push({
          type: 'knowledge_gap',
          category: 'import_aliases',
          detail: undocumented.join(', '),
          message: `${undocumented.length} import aliases (${undocumented.slice(0, 3).join(', ')}) not documented — agents may use wrong import paths`,
          autoFixable: true
        });
      }
    } catch { /* malformed tsconfig */ }
  }

  // 5. Scan for env variables
  const envExample = join(projectRoot, '.env.example');
  if (existsSync(envExample)) {
    const hasCoverage = allSpecs.some(s =>
      s.content?.includes('.env') || s.tags?.includes('environment')
    );
    if (!hasCoverage) {
      const varCount = readFileSync(envExample, 'utf8')
        .split('\n').filter(l => l.includes('=')).length;
      gaps.push({
        type: 'knowledge_gap',
        category: 'environment_variables',
        detail: `${varCount} variables in .env.example`,
        message: `${varCount} environment variables not documented in specs — agents won't know which are required or what they do`,
        autoFixable: true
      });
    }
  }

  // 6. Check for monorepo/workspace structure
  const pkgData = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  if (pkgData.workspaces || existsSync(join(projectRoot, 'pnpm-workspace.yaml'))) {
    const hasCoverage = allSpecs.some(s =>
      s.tags?.includes('monorepo') || s.content?.includes('workspace')
    );
    if (!hasCoverage) {
      gaps.push({
        type: 'architectural_gap',
        category: 'monorepo_structure',
        detail: 'Workspace configuration detected',
        message: 'Monorepo/workspace structure not documented — agents may violate package boundaries',
        autoFixable: false  // needs human input on boundary rules
      });
    }
  }

  // Calculate coverage score
  const totalPatterns = gaps.length + covered.length;
  const coveragePercent = totalPatterns > 0
    ? Math.round((covered.length / totalPatterns) * 100)
    : 100;

  return {
    coveragePercent,
    gaps,
    covered,
    totalPatterns,
    autoFixableCount: gaps.filter(g => g.autoFixable).length
  };
}
```

**Output: harness-readiness-report.md**

```markdown
# Harness Readiness Report

## Coverage Score: 62% (15 of 24 patterns covered by specs)

## Gaps Found

### High Priority (agents will likely stumble on these)
1. **Custom error handling** — `src/lib/errors.ts` exports AppError, ValidationError,
   NotFoundError but no spec covers error handling patterns.
   → Recommendation: Create spec with grep_must_not_exist rule for `new Error(`

2. **Database utilities** — `src/lib/db/` has custom query builder, connection pool,
   migration runner. No spec covers database patterns.
   → Recommendation: Create spec documenting query patterns and migration workflow

3. **Import aliases** — tsconfig.json defines 6 path aliases (@/lib, @/services, etc.)
   not documented in any spec.
   → Recommendation: Add to architecture spec or create import convention spec

### Medium Priority
4. **Custom scripts** — package.json has 8 non-standard scripts (seed, migrate,
   generate-types, etc.) not referenced in any spec.
   → Recommendation: Document in a tooling/workflow spec

### Low Priority
5. **Env variables** — .env.example lists 14 variables. No spec documents which
   are required vs optional.

## Auto-Fixable Gaps: 7 of 9
Run `/tw:readiness --fix` to auto-generate draft specs for gaps marked as auto-fixable.
```

**Auto-generated draft specs**: The audit can generate draft specs for auto-fixable gaps. Not just "you're missing a spec" but "here's a draft spec based on what I found in the code":

```javascript
export function generateDraftSpecForGap(gap, projectRoot) {
  if (gap.category === 'custom_base_class') {
    // Read the class file, extract exports, generate spec
    const content = readFileSync(gap.file, 'utf8');
    const exports = extractExports(content);
    return {
      domain: inferDomain(gap.file),
      name: `${gap.detail} patterns`,
      content: `# ${gap.detail} Usage Patterns\n\n` +
        `## Exports\n${exports.map(e => `- \`${e}\``).join('\n')}\n\n` +
        `## Usage\nAlways use \`${gap.detail}\` instead of base \`Error\`.\n`,
      rules: [{
        type: 'grep_must_not_exist',
        pattern: 'new Error\\(',
        files: 'src/**/*.ts',
        message: `Use ${gap.detail} instead of base Error`
      }],
      confidence: 0.4  // draft — needs human review
    };
  }
  // ... similar generators for other gap categories
}
```

**Where this lives**:
- New `auditHarnessReadiness()` in `lib/spec-engine.js`
- Called from `/tw:analyze-codebase` (adds readiness section to output)
- Available as standalone `/tw:readiness` command
- Auto-fix mode: `/tw:readiness --fix` generates draft specs

---

### 8.2 Pre-Execution Gap Scanner

Before `/tw:execute-phase` starts spawning executors, scan the plan's file targets against existing specs. This catches gaps at the last moment before an agent would hit them.

**When it runs**: In `templates/commands/tw-execute-phase.md`, as new Step 1.5 (after budget check, before loading plans).

**New function in `lib/spec-engine.js`:**

```javascript
export function scanPlanForGaps(planXml, allSpecs) {
  const gaps = [];

  for (const task of planXml.tasks) {
    const taskFiles = task.files;  // e.g., ["src/services/auth.ts", "src/lib/db/users.ts"]

    // 1. Check: do any file targets fall in directories with zero spec coverage?
    for (const file of taskFiles) {
      const dir = dirname(file);
      const hasSpec = allSpecs.some(s =>
        s.rules?.some(r => r.files && minimatch(file, r.files)) ||
        s.tags?.some(t => dir.includes(t))
      );
      if (!hasSpec) {
        gaps.push({
          type: 'uncovered_directory',
          taskId: task.id,
          file,
          message: `${dir}/ has no spec coverage — agent may lack context`
        });
      }
    }

    // 2. Check: does the task description reference patterns not in any spec?
    const keywords = extractKeywords(task.description); // auth, database, caching, etc.
    for (const keyword of keywords) {
      const hasSpec = allSpecs.some(s =>
        s.tags?.includes(keyword) || s.name?.toLowerCase().includes(keyword)
      );
      if (!hasSpec) {
        gaps.push({
          type: 'uncovered_pattern',
          taskId: task.id,
          keyword,
          message: `Task references "${keyword}" but no spec covers this pattern`
        });
      }
    }

    // 3. Check: does the plan reference libraries not in any spec?
    const libraries = extractLibraryReferences(task.description);
    for (const lib of libraries) {
      const hasSpec = allSpecs.some(s => s.content?.includes(lib));
      if (!hasSpec) {
        gaps.push({
          type: 'undocumented_library',
          taskId: task.id,
          library: lib,
          message: `Library "${lib}" referenced but not documented in specs`
        });
      }
    }
  }

  return gaps;
}
```

**What happens when gaps are found:**

The executor doesn't just *not know* about the gap — it gets a heads-up. Output before execution starts:

```
Pre-execution gap scan found 2 potential gaps:

1. [T-1-2-1] src/lib/db/ has no spec coverage — agent may lack context
   Action: Injecting directory README if found, or flagging for manual spec creation

2. [T-1-2-3] Task references "caching" but no spec covers this pattern
   Action: Agent will need to discover patterns by reading existing code

Proceeding with execution. Gaps tracked in gap-report.json.
```

**Response actions for each gap type:**

| Gap Type | Automatic Response | Manual Follow-up |
|----------|-------------------|-----------------|
| `uncovered_directory` | If directory has README.md → inject into executor context. If not → warn executor: "No spec for this area, read existing code first" | Suggest spec creation in handoff |
| `uncovered_pattern` | Search for existing code matching the keyword → inject file list as context hint | Suggest spec creation in handoff |
| `undocumented_library` | Search for existing usage of the library in codebase → inject examples | Suggest adding to spec |

**After execution**: If the task succeeds despite the gap, propose a spec from what the agent learned (confidence 0.4 — higher than code_bug at 0.3 because we confirmed a gap exists, but lower than knowledge_gap at 0.5 because it didn't cause a failure).

---

### 8.3 Post-Session Gap Aggregation

Gap reports accumulate across sessions via `gap-report.json` (Part 6.3). Instead of just listing them in handoffs, we can aggregate and prioritize them.

**New function in `lib/state.js`:**

```javascript
export function aggregateGaps() {
  const report = readGapReport();
  const gaps = report.gaps ?? [];

  // Group by description fingerprint (similar gaps across sessions)
  const grouped = {};
  for (const gap of gaps) {
    const key = gap.type + ':' + fingerprint(gap.description);
    if (!grouped[key]) {
      grouped[key] = { ...gap, occurrences: 0, sessions: new Set() };
    }
    grouped[key].occurrences++;
    grouped[key].sessions.add(gap.sessionId ?? 'unknown');
  }

  // Sort by frequency — most recurring gaps first
  return Object.values(grouped)
    .sort((a, b) => b.occurrences - a.occurrences)
    .map(g => ({
      ...g,
      sessions: g.sessions.size,
      priority: g.occurrences >= 3 ? 'high' : g.occurrences >= 2 ? 'medium' : 'low',
      recommendation: generateRecommendation(g)
    }));
}
```

**Where it surfaces:**

1. **Session-start** (`hooks/session-start.js`): If there are high-priority recurring gaps, inject a one-liner:
   ```
   ⚠ Recurring gap: src/lib/db/ has no spec coverage (hit 4 times across 3 sessions). Consider creating a spec.
   ```

2. **`/tw:readiness`**: Shows the full aggregated gap report with trends alongside the codebase audit

3. **Handoff Section 4b**: Already designed in Part 6.3, now enriched with occurrence counts and cross-session trends

**The self-healing loop:**

```
Session 1: Agent fails on AppError → gap detected (1 occurrence)
Session 2: Same gap → (2 occurrences, medium priority)
Session 3: Same gap → (3 occurrences, HIGH priority)
           Session-start warns: "Recurring gap — create error-handling spec"
           User creates spec OR system auto-generates draft → gap never recurs
```

At 3+ occurrences, the system can auto-generate a draft spec:
```javascript
if (aggregatedGap.occurrences >= 3 && aggregatedGap.autoFixable) {
  const draft = generateDraftSpecForGap(aggregatedGap, projectRoot);
  proposeSpecUpdate(
    `auto-gap/${aggregatedGap.category}`,
    draft.content,
    `Recurring gap: ${aggregatedGap.message}`,
    {
      source: 'gap-aggregation',
      initialConfidence: 0.5,  // high — verified recurring gap
      proposedRules: draft.rules
    }
  );
}
```

---

### 8.4 How All Three Layers Connect

```
/tw:analyze-codebase (or /tw:readiness)                        PROACTIVE LAYER 1
    │
    │  "Your codebase has these uncovered areas"
    │  Output: harness-readiness-report.md + draft spec proposals
    │  Auto-fix: /tw:readiness --fix generates draft specs
    │
    ▼
/tw:execute-phase (pre-execution scan)                         PROACTIVE LAYER 2
    │
    │  "This plan touches uncovered areas"
    │  Output: gap warnings + README injection + gap-report entries
    │  Context: inject directory READMEs or existing code examples
    │
    ▼
Ralph Loop failure                                             REACTIVE LAYER
    │
    │  "Agent failed because of missing knowledge/capability"
    │  Output: classified gap + fast-track proposal (Part 6.1-6.2)
    │
    ▼
Handoff (Section 4b)                                           REPORTING
    │
    │  "These gaps were hit this session"
    │  Output: prioritized list with recommendations
    │
    ▼
Next session start                                             AGGREGATION
    │
    │  "These gaps keep recurring — fix them"
    │  Output: high-priority warnings + auto-generated draft specs
    │
    ▼
User acts (or system auto-proposes at 3+ occurrences)          RESOLUTION
    │
    │  Spec created → rule added → gap removed from future reports
    │  Coverage score improves → readiness audit reflects progress
```

All three layers feed into the same `gap-report.json`, enabling cross-session aggregation regardless of where the gap was first detected (proactive audit, pre-execution scan, or reactive failure).

---

### 8.5 Files Impact (Incremental to Parts 4-7)

| File | Part | Action |
|------|------|--------|
| `lib/spec-engine.js` | 8.1, 8.2 | Modify — add `auditHarnessReadiness()`, `scanPlanForGaps()`, `generateDraftSpecForGap()` |
| `lib/state.js` | 8.3 | Modify — add `aggregateGaps()` (extends `readGapReport()` from Part 6.3) |
| `hooks/session-start.js` | 8.3 | Modify — inject recurring gap warnings from aggregation |
| `templates/commands/tw-readiness.md` | 8.1 | **Create** — new `/tw:readiness` command |
| `templates/commands/tw-analyze-codebase.md` | 8.1 | Modify — add harness readiness audit to output |
| `templates/commands/tw-execute-phase.md` | 8.2 | Modify — add pre-execution gap scan (Step 1.5) |
| `tests/unit/spec-engine-gaps.test.js` | 8.1, 8.2 | **Create** — tests for readiness audit + plan gap scanner |
| `tests/unit/state-gaps.test.js` | 8.3 | **Create** — tests for gap aggregation |

---

## Part 9: Runtime QA Beyond Lint/Type/Test (Discussion: 2026-03-20)

### The Problem

Problem 2 from the article: as agent throughput scaled, human QA became the limiting constraint. OpenAI solved this by making the running application legible to agents — Chrome DevTools Protocol, DOM snapshots, LogQL/PromQL for logs/metrics. Their agents ran 6+ hours autonomously, reproducing bugs from telemetry.

We initially flagged this as "Low priority — requires deep integration with each user's stack." But the real question isn't "can Threadwork integrate with every observability stack?" — it's **"what QA can Threadwork automate beyond lint/type/test?"**

### What QA Threadwork Does Today

```
Static Analysis (automated, in Ralph Loop):
  ✅ TypeScript type checking
  ✅ Linting (eslint/biome/oxlint)
  ✅ Test execution
  ✅ Build verification
  ✅ Security audit (npm audit)

Semantic Verification (agent-driven, in verify-phase):
  ✅ Requirements coverage check
  ✅ Done-condition verification
  ✅ Integration observation
  ⬜ (planned) Spec rule compliance — Part 4.3
  ⬜ (planned) Review criteria checking — Part 4.6

Runtime Verification:
  ❌ Can the app actually start?
  ❌ Do API endpoints return expected responses?
  ❌ Does the UI render correctly?
  ❌ Do logs show expected behavior?
```

The entire Runtime Verification row is missing. That's the gap.

### The Key Insight: Not Everything Is a Web App

Not every project has HTTP endpoints to hit. Consider:

- **Obsidian plugins** — loaded in dev mode, no API to hit
- **VS Code extensions** — requires Extension Development Host
- **CLI tools** — run commands, check output
- **Library packages** — consumed by other code, no runtime
- **Desktop apps (Electron)** — GUI, no browser
- **Browser extensions** — loaded into Chrome, can't automate easily

**The user knows how to validate their project, but Threadwork doesn't ask.** This means Threadwork needs both generic runtime gates (for things it can figure out itself) AND a way to capture project-specific verification from the user.

---

### 9.1 Level 1: Smoke Test Gate (Zero Configuration)

The simplest possible runtime check: **can the app start without crashing?**

Auto-detects the start/dev script from package.json. Starts the app, waits for a success signal or error, kills after timeout. No user configuration needed.

```javascript
// New gate in quality-gate.js
export async function runSmokeTest() {
  const pkg = join(process.cwd(), 'package.json');
  if (!existsSync(pkg)) return { passed: true, skipped: true, reason: 'No package.json' };

  const pkgData = JSON.parse(readFileSync(pkg, 'utf8'));
  const startScript = pkgData.scripts?.start ?? pkgData.scripts?.dev;
  if (!startScript) return { passed: true, skipped: true, reason: 'No start/dev script' };

  // Start the app, wait for it to bind a port or timeout
  const child = spawn('npm', ['run', pkgData.scripts?.dev ? 'dev' : 'start'], {
    cwd: process.cwd(), timeout: 15000, stdio: 'pipe'
  });

  return new Promise((resolve) => {
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });

    // Success signals: "listening on", "ready on", "started on"
    const successPattern = /listening|ready|started|running/i;
    const errorPattern = /error|crash|EADDRINUSE|Cannot find/i;

    const check = setInterval(() => {
      if (successPattern.test(output)) {
        clearInterval(check);
        child.kill();
        resolve({ passed: true, errors: [] });
      }
      if (errorPattern.test(output)) {
        clearInterval(check);
        child.kill();
        resolve({ passed: false, errors: [output.slice(-500)] });
      }
    }, 1000);

    child.on('exit', (code) => {
      clearInterval(check);
      resolve(code === 0 || successPattern.test(output)
        ? { passed: true, errors: [] }
        : { passed: false, errors: [`App exited with code ${code}: ${output.slice(-500)}`] });
    });

    setTimeout(() => {
      clearInterval(check);
      child.kill();
      resolve({ passed: true, errors: [], warning: 'App did not signal ready within 15s' });
    }, 15000);
  });
}
```

**Catches**: Missing dependencies, broken imports, config errors, port conflicts — things that pass type/lint/test but fail at runtime. Very common with agent-generated code.

---

### 9.2 Level 2: HTTP Endpoint Verification (Zero Configuration)

If the app has API endpoints, verify they respond correctly. Builds on the smoke test — the app is already running.

**Key insight**: The plan XML already has `<verification>` blocks with specific expectations like "POST /auth/login returns { token, expiresAt }". We can parse those and actually execute HTTP checks:

```javascript
// New gate: runEndpointVerification(plan)
export async function runEndpointVerification(plan, baseUrl = 'http://localhost:3000') {
  const checks = [];

  for (const task of plan.tasks) {
    // Parse verification blocks for HTTP expectations
    const httpChecks = extractHttpExpectations(task.verification);
    // e.g., [{ method: 'POST', path: '/auth/login', expectStatus: 200, expectBody: ['token'] }]

    for (const check of httpChecks) {
      try {
        const res = await fetch(`${baseUrl}${check.path}`, {
          method: check.method,
          headers: { 'Content-Type': 'application/json' },
          body: check.body ? JSON.stringify(check.body) : undefined
        });

        const passed = check.expectStatus
          ? res.status === check.expectStatus
          : res.ok;

        const body = await res.json().catch(() => null);
        const bodyCheck = check.expectBody
          ? check.expectBody.every(key => body && key in body)
          : true;

        checks.push({
          endpoint: `${check.method} ${check.path}`,
          passed: passed && bodyCheck,
          status: res.status,
          missingKeys: check.expectBody?.filter(k => !body || !(k in body)) ?? []
        });
      } catch (e) {
        checks.push({
          endpoint: `${check.method} ${check.path}`,
          passed: false,
          error: e.message
        });
      }
    }
  }

  return {
    gate: 'endpoint-verification',
    passed: checks.every(c => c.passed),
    checks,
    skipped: checks.length === 0,
    reason: checks.length === 0 ? 'No HTTP expectations found in plan verification blocks' : undefined
  };
}
```

**Why this requires zero configuration**: The expected behavior is already specified in the plan XML — we're actually checking it at runtime instead of trusting the agent's self-report.

---

### 9.3 Level 3: Verification Profiles (User-Configured, Any Project Type)

For projects that aren't web apps — Obsidian plugins, CLI tools, VS Code extensions, libraries — Threadwork needs to **ask the user how their project is validated** and build a verification profile.

#### 9.3.1 Discuss-Phase Question 10

Added to the enhanced discuss-phase (Part 4.4):

| # | Question | Feeds into |
|---|----------|------------|
| **10** | **Verification environment** — "How do you validate this project works? (web app, CLI, plugin, library, other)" | **Verification profile in project.json** |

Follow-up questions depend on the answer:

```
User: "It's an Obsidian plugin"
    │
    ▼
Follow-ups:
  - "How do you build it?" → "npm run build"
  - "What's the build output?" → "main.js in project root"
  - "What must the manifest contain?" → "id, name, version, minAppVersion"
  - "How do you test it manually?" → "Load in Obsidian dev vault, open settings,
     check the plugin appears, toggle it on, verify the ribbon icon shows"
  - "Any automated checks possible?" → "manifest.json must be valid JSON with
     required fields, main.js must export an onload function"
```

#### 9.3.2 The Verification Profile

Stored in `project.json` under a new `verification` key:

```json
{
  "verification": {
    "type": "plugin",
    "platform": "obsidian",
    "build": {
      "command": "npm run build",
      "outputs": ["main.js", "manifest.json", "styles.css"]
    },
    "automated": [
      {
        "name": "Manifest validation",
        "check": "json_schema",
        "file": "manifest.json",
        "requiredFields": ["id", "name", "version", "minAppVersion", "description", "author"]
      },
      {
        "name": "Build output exports",
        "check": "export_exists",
        "file": "main.js",
        "exports": ["onload", "onunload"]
      },
      {
        "name": "No banned APIs",
        "check": "grep_must_not_exist",
        "pattern": "eval\\(|document\\.write",
        "files": "src/**/*.ts",
        "message": "Obsidian plugins must not use eval() or document.write()"
      }
    ],
    "manual": [
      {
        "step": "Load plugin in dev vault",
        "expected": "Plugin appears in Settings → Community Plugins",
        "critical": true
      },
      {
        "step": "Toggle plugin on",
        "expected": "No errors in console, ribbon icon appears",
        "critical": true
      },
      {
        "step": "Open command palette",
        "expected": "Plugin commands are listed",
        "critical": false
      }
    ]
  }
}
```

#### 9.3.3 Profile-Aware Check Runner

New module `lib/verification-profile.js`:

```javascript
export function runProfileChecks(profile) {
  const results = [];

  // Run build first if specified
  if (profile.build?.command) {
    const buildResult = runCmd(profile.build.command);
    if (!buildResult.passed) {
      return { gate: 'profile-verification', passed: false,
        results: [{ name: 'Build', passed: false, errors: [buildResult.output.slice(-500)] }] };
    }
    // Verify build outputs exist
    for (const output of profile.build.outputs ?? []) {
      if (!existsSync(join(process.cwd(), output))) {
        results.push({ name: `Build output: ${output}`, passed: false,
          errors: [`Expected build output ${output} not found`] });
      }
    }
  }

  // Run automated checks
  for (const check of profile.automated ?? []) {
    switch (check.check) {
      case 'json_schema':
        results.push(verifyJsonSchema(check.file, check.requiredFields));
        break;
      case 'export_exists':
        results.push(verifyExports(check.file, check.exports));
        break;
      case 'grep_must_not_exist':
        results.push(verifyNoForbiddenPatterns(check.pattern, check.files, check.message));
        break;
      case 'command_runs':
        results.push(verifyCommandRuns(check.command, check.expectOutput, check.expectExitCode));
        break;
      case 'file_exists':
        results.push(verifyFilesExist(check.files));
        break;
    }
  }

  return {
    gate: 'profile-verification',
    passed: results.every(r => r.passed),
    results,
    skipped: results.length === 0,
    reason: results.length === 0 ? 'No automated profile checks defined' : undefined
  };
}
```

Individual check implementations:

```javascript
function verifyJsonSchema(file, requiredFields) {
  const filePath = join(process.cwd(), file);
  if (!existsSync(filePath)) {
    return { name: `JSON schema: ${file}`, passed: false, errors: [`${file} not found`] };
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    const missing = requiredFields.filter(f => !(f in data));
    return {
      name: `JSON schema: ${file}`,
      passed: missing.length === 0,
      errors: missing.map(f => `Missing required field: ${f}`)
    };
  } catch (e) {
    return { name: `JSON schema: ${file}`, passed: false, errors: [`Invalid JSON: ${e.message}`] };
  }
}

function verifyExports(file, expectedExports) {
  const filePath = join(process.cwd(), file);
  if (!existsSync(filePath)) {
    return { name: `Exports: ${file}`, passed: false, errors: [`${file} not found`] };
  }
  const content = readFileSync(filePath, 'utf8');
  const missing = expectedExports.filter(exp =>
    !content.includes(`export`) || !new RegExp(`(export\\s+(function|class|const|let|var)\\s+${exp}|exports\\.${exp}|module\\.exports.*${exp})`).test(content)
  );
  return {
    name: `Exports: ${file}`,
    passed: missing.length === 0,
    errors: missing.map(e => `Missing expected export: ${e}`)
  };
}

function verifyCommandRuns(command, expectOutput, expectExitCode = 0) {
  const result = runCmd(command);
  const exitOk = result.exitCode === expectExitCode;
  const outputOk = !expectOutput || result.output.includes(expectOutput);
  return {
    name: `Command: ${command}`,
    passed: exitOk && outputOk,
    errors: [
      ...(!exitOk ? [`Exit code ${result.exitCode}, expected ${expectExitCode}`] : []),
      ...(!outputOk ? [`Output did not contain expected: "${expectOutput}"`] : [])
    ]
  };
}
```

#### 9.3.4 Automated Checks Per Project Type

What can be verified mechanically for each project type:

| Project Type | Automated Checks |
|-------------|-----------------|
| **Web app** | Smoke test (app starts), endpoint verification (HTTP checks from plan) |
| **Obsidian plugin** | manifest.json valid with required fields, main.js exports onload/onunload, no banned APIs, build outputs exist |
| **VS Code extension** | package.json has activationEvents + contributes, main entry exists, `vsce package` succeeds |
| **CLI tool** | Binary exists after build, `--help` exits 0, `--version` matches package.json version |
| **Library** | All declared exports resolve, types compile (if TypeScript), peer dependencies satisfied |
| **Electron app** | Main process starts without crash (exit code 0 within 10s), preload scripts exist |
| **Browser extension** | manifest.json valid (v2 or v3), content scripts reference existing files, icons exist |

#### 9.3.5 Profile Templates (Starter Kits)

To reduce setup cost, Threadwork offers starter profiles for common project types. During discuss-phase:

```
Threadwork: "What type of project is this?"
  [Web App]  [CLI Tool]  [Library]  [Obsidian Plugin]
  [VS Code Extension]  [Browser Extension]  [Other]

User: "Obsidian Plugin"

Threadwork: "Loading Obsidian plugin verification template.
 I'll pre-fill common checks — please confirm or adjust:

 Build command: npm run build (correct?)
 Build outputs: main.js, manifest.json, styles.css (correct?)
 Required manifest fields: id, name, version, minAppVersion (add more?)
 Required exports: onload, onunload (add more?)

 Manual checks I've pre-filled:
 1. Plugin appears in Settings → Community Plugins
 2. No console errors on load
 3. Commands appear in command palette

 Add any project-specific manual checks?"
```

Stored in `templates/verification-profiles/`:

```
templates/verification-profiles/
├── web-app.json          # smoke test + endpoint verification
├── cli-tool.json         # command execution + output checks
├── library.json          # export verification + type checking
├── obsidian-plugin.json  # manifest + build output + manual loading
├── vscode-extension.json # package.json validation + activation
├── browser-extension.json # manifest v3 + content script checks
└── electron-app.json     # main process start + preload checks
```

---

### 9.4 Guided Manual Verification (Enhanced UAT.md)

For things that can't be automated, the verifier already generates `UAT.md`. But currently it's generic. With the verification profile, it becomes **project-type aware**.

**Profile-aware UAT.md output:**

```markdown
# Phase 1 Manual Verification Steps

## Environment Setup
Platform: Obsidian (plugin)
Prerequisites:
- Obsidian installed with dev vault at ~/obsidian-dev/
- Community plugins enabled in settings

## Critical Checks (must pass before phase completion)

### 1. Plugin Loading
- Run `npm run build` in project root
- Copy main.js, manifest.json, styles.css to ~/obsidian-dev/.obsidian/plugins/my-plugin/
- Restart Obsidian
- [ ] **Expected**: Plugin appears in Settings → Community Plugins
- [ ] **Verify**: No errors in developer console (Ctrl+Shift+I)

### 2. Core Functionality
- Toggle plugin ON in settings
- [ ] **Expected**: Ribbon icon appears in left sidebar
- [ ] **Expected**: Command palette (Ctrl+P) shows "My Plugin: Do Thing"

### 3. Phase-Specific Checks (from plan verification blocks)
- Open a note and trigger the plugin command
- [ ] **Expected**: [specific behavior from task done-condition]

## Non-Critical Checks
- [ ] Settings tab renders without errors
- [ ] Plugin gracefully handles empty notes
```

The manual steps come from **two sources**:
1. `verification.manual` in project.json (from discuss-phase — stable across phases)
2. Task `<verification>` and `<done-condition>` blocks from plan XML (phase-specific)

---

### 9.5 Structured Manual Feedback: /tw:verify-manual

After the user runs manual checks, they can report results back via a new command:

```
User: /tw:verify-manual

Threadwork: Running through manual verification for Phase 1:

1. Plugin Loading — did the plugin appear in Settings?
   [Pass] [Fail] [Skip]

2. Core Functionality — did the ribbon icon appear?
   [Pass] [Fail] [Skip]

3. Phase-specific: command produces expected output?
   [Pass] [Fail] [Skip]
```

**What happens with results:**

- **Pass** → recorded as verification evidence in VERIFICATION.md
- **Fail on critical step** → blocks phase completion (status stays at `PHASE_EXECUTED`, not `PHASE_VERIFIED`)
- **Fail on non-critical step** → recorded as warning, doesn't block
- **Skip** → recorded as `UNVERIFIED`

**Failed manual checks feed back into the system:**
- Logged as **gap report entries** (feeds into Part 8 aggregation) — "manual check failed" is a signal that automated checks should be added
- If the same manual check fails across sessions, propose automating it: "Plugin loading check has failed 3 times — consider adding a build output verification to the profile"
- Verifier report includes manual results alongside automated gate results

---

### 9.6 Gate Execution Strategy

Runtime gates are heavier than lint/type/test. They should run at appropriate points:

**Ralph Loop gates (every iteration — fast):**
```
typecheck → lint → tests → spec-compliance → smoke-test*
```
*Smoke test only for web-app profile type. 15s timeout.

**Verify-phase gates (end of phase — thorough):**
```
all Ralph Loop gates
  + endpoint-verification*     (web-app profile only)
  + profile-verification       (automated checks from verification profile)
  + runtime-checks             (custom .threadwork/runtime-checks/ files)
```
*Endpoint verification only for web-app profile type.

**Manual verification (user-driven — after verify-phase):**
```
UAT.md generated from profile + plan verification blocks
  + /tw:verify-manual for structured feedback
  + critical manual checks block phase completion
```

**Profile type determines which gates are relevant:**

| Profile Type | Smoke Test | Endpoint Verification | Profile Checks | Manual Steps |
|-------------|-----------|----------------------|----------------|-------------|
| web-app | Yes (Ralph Loop) | Yes (verify-phase) | Optional | Optional |
| cli-tool | No | No | command_runs, file_exists | Optional |
| library | No | No | export_exists, build_output | Minimal |
| obsidian-plugin | No | No | json_schema, export_exists, build_output | Yes (critical) |
| vscode-extension | No | No | json_schema, export_exists | Yes (critical) |
| browser-extension | No | No | json_schema, file_exists | Yes (critical) |
| electron-app | No* | No | build_output, file_exists | Yes (critical) |
| custom | Configurable | Configurable | User-defined | User-defined |

*Electron apps could have a smoke test (main process start) but it's more complex than web app detection.

**Gate configuration in quality-config.json:**

```json
{
  "typecheck": { "enabled": true, "blocking": true },
  "lint": { "enabled": true, "blocking": true },
  "tests": { "enabled": true, "blocking": true },
  "spec-compliance": { "enabled": true, "blocking": true },
  "smoke-test": { "enabled": true, "blocking": true },
  "endpoint-verification": { "enabled": true, "blocking": false },
  "profile-verification": { "enabled": true, "blocking": true },
  "runtime-checks": { "enabled": true, "blocking": false },
  "build": { "enabled": false, "blocking": false },
  "security": { "enabled": true, "blocking": false }
}
```

Smoke test and profile checks are blocking (fundamental correctness). Endpoint verification and custom runtime checks default to non-blocking (may have false positives).

---

### 9.7 Files Impact (Incremental to Parts 4-8)

| File | Part | Action |
|------|------|--------|
| `lib/verification-profile.js` | 9.3 | **Create** — profile loader, check runner (json_schema, export_exists, command_runs, file_exists, grep_must_not_exist), manual check tracker |
| `lib/quality-gate.js` | 9.1, 9.2, 9.6 | Modify — add `runSmokeTest()`, `runEndpointVerification()`, `runProfileChecks()`, update `runAll()` gate sequence and config |
| `templates/verification-profiles/` | 9.3.5 | **Create** — 7 starter profile templates (web-app, cli-tool, library, obsidian-plugin, vscode-extension, browser-extension, electron-app) |
| `templates/commands/tw-discuss-phase.md` | 9.3.1 | Modify — add question 10 (verification environment), profile template loading |
| `templates/commands/tw-verify-phase.md` | 9.4 | Modify — profile-aware UAT.md generation |
| `templates/commands/tw-verify-manual.md` | 9.5 | **Create** — `/tw:verify-manual` command for structured user feedback |
| `templates/agents/tw-verifier.md` | 9.4 | Modify — use profile for targeted verification, generate profile-aware UAT.md, include manual results |
| `tests/unit/verification-profile.test.js` | 9.3 | **Create** — profile loading, each check type |
| `tests/unit/quality-gate-smoke.test.js` | 9.1, 9.2 | **Create** — smoke test, endpoint verification |
| `tests/integration/runtime-verification.test.js` | 9.1-9.6 | **Create** — profile detection, gate execution, manual feedback loop |

---

## Part 10: Doc-Freshness Enforcement (Discussion: 2026-03-20)

### The Problem

Problem 3 from the article: "One big AGENTS.md" failed. Monolithic manuals "rot instantly." OpenAI solved this with mechanical enforcement via linters and CI validating "the knowledge base is up to date, cross-linked, and structured correctly," plus a "doc-gardening" agent.

Threadwork's Progressive Disclosure handles context *delivery* well (routing map + on-demand spec_fetch). But nothing mechanically validates that the docs themselves are *correct*. Specs can reference deleted files, removed libraries, or renamed functions — and no gate catches it.

### Current File Formats Vulnerable to Staleness

From the Threadwork file format catalog:

| Format | Staleness Risk | Current Freshness Check |
|--------|---------------|------------------------|
| **Specs** (`.threadwork/specs/{domain}/*.md`) | Reference code files, libraries, patterns that change | `updated` field in frontmatter — never validated |
| **CONTEXT.md** (per phase) | References libraries, patterns, constraints from discuss-phase | No timestamp, no reference tracking |
| **Plan XML** (`<files>`, `<verification>`) | References specific file paths that may move | No validation after creation |
| **Store entries** (`~/.threadwork/store/`) | Cross-project patterns that may become outdated | `confidence` field — no staleness check |
| **Spec proposals** (`.threadwork/specs/proposals/`) | Based on errors that may have been resolved | `createdAt` only — no expiry |
| **Routing map** (generated at runtime) | Surfaces specs that may be stale | Inherits staleness from underlying specs |
| **quality-config.json** | Gate configuration may become outdated | Never re-evaluated |

### Three Layers of Staleness

**Layer 1: Spec-to-Code Reference Decay** — Specs reference files, functions, libraries. When code changes, references break silently.

Detectable signals:
- Spec mentions file path `src/lib/auth.ts` → file renamed or deleted
- Spec says "use jose library" → `jose` removed from package.json
- Spec rule targets `files: "src/lib/auth*.ts"` → no files match that glob anymore
- Spec references `SPEC:auth-001` → that spec ID was removed or renamed

**Layer 2: Spec Age vs Code Churn** — Even if references are valid, a spec can be semantically stale.

Detectable signals:
- Spec `updated` date is old AND files referenced by the spec have been modified since
- Spec covers a directory where >50% of files changed since spec was last updated

**Layer 3: Cross-Spec Consistency** — Specs can contradict each other.

Detectable signals:
- Two specs in the same domain have contradictory rules
- Spec references another spec ID that doesn't exist
- Multiple specs cover overlapping file globs with conflicting rules

---

### 10.1 Doc-Freshness Gate (Mechanical, in Quality Gate Sequence)

New module `lib/doc-freshness.js` and new gate `runDocFreshness()`:

```javascript
// lib/doc-freshness.js

export function checkDocFreshness(specsDir, projectRoot) {
  const violations = [];

  for (const spec of loadAllSpecs(specsDir)) {
    // 1. Dead file references — spec mentions files that don't exist
    const referencedFiles = extractFileReferences(spec.content);
    for (const ref of referencedFiles) {
      const resolved = resolveGlob(ref, projectRoot);
      if (resolved.length === 0) {
        violations.push({
          type: 'dead_reference',
          specId: spec.data.specId,
          specFile: spec.path,
          reference: ref,
          message: `Spec ${spec.data.specId} references "${ref}" but no matching files exist`,
          severity: 'error'
        });
      }
    }

    // 2. Dead spec cross-references — spec mentions SPEC:IDs that don't exist
    const crossRefs = extractSpecReferences(spec.content); // [SPEC:auth-001], etc.
    for (const ref of crossRefs) {
      if (!specIdExists(ref, specsDir)) {
        violations.push({
          type: 'dead_cross_reference',
          specId: spec.data.specId,
          reference: ref,
          message: `Spec ${spec.data.specId} references ${ref} but that spec ID doesn't exist`,
          severity: 'error'
        });
      }
    }

    // 3. Dead library references — spec mentions libraries not in package.json
    const libraries = extractLibraryReferences(spec.content);
    const installedDeps = getInstalledDependencies(projectRoot);
    for (const lib of libraries) {
      if (!installedDeps.includes(lib)) {
        violations.push({
          type: 'dead_library_reference',
          specId: spec.data.specId,
          library: lib,
          message: `Spec ${spec.data.specId} references library "${lib}" but it's not in package.json`,
          severity: 'warning'
        });
      }
    }

    // 4. Stale rule targets — rules whose file globs match nothing
    for (const rule of spec.data.rules ?? []) {
      if (rule.files) {
        const matches = resolveGlob(rule.files, projectRoot);
        if (matches.length === 0) {
          violations.push({
            type: 'empty_rule_target',
            specId: spec.data.specId,
            rule: rule.type,
            glob: rule.files,
            message: `Rule in ${spec.data.specId} targets "${rule.files}" but no files match`,
            severity: 'warning'
          });
        }
      }
    }

    // 5. Age-based staleness — spec old + referenced files changed since
    const specUpdated = spec.data.updated ? new Date(spec.data.updated) : null;
    if (specUpdated) {
      const referencedFilesFlat = extractFileReferences(spec.content)
        .flatMap(ref => resolveGlob(ref, projectRoot));
      const filesChangedSinceSpec = referencedFilesFlat.filter(f => {
        try {
          const lastModified = getFileLastModifiedFromGit(f, projectRoot);
          return lastModified > specUpdated;
        } catch { return false; }
      });
      if (filesChangedSinceSpec.length > 0) {
        const ratio = filesChangedSinceSpec.length / Math.max(referencedFilesFlat.length, 1);
        if (ratio > 0.5) {
          violations.push({
            type: 'age_staleness',
            specId: spec.data.specId,
            updatedAt: spec.data.updated,
            changedFiles: filesChangedSinceSpec.length,
            totalFiles: referencedFilesFlat.length,
            message: `Spec ${spec.data.specId} updated ${spec.data.updated} but ${filesChangedSinceSpec.length}/${referencedFilesFlat.length} referenced files changed since`,
            severity: 'warning'
          });
        }
      }
    }
  }

  return {
    gate: 'doc-freshness',
    passed: violations.filter(v => v.severity === 'error').length === 0,
    violations,
    errors: violations.filter(v => v.severity === 'error'),
    warnings: violations.filter(v => v.severity === 'warning'),
    skipped: false
  };
}
```

**Blocking vs warning:**

| Violation Type | Severity | Rationale |
|---------------|----------|-----------|
| `dead_reference` (file doesn't exist) | **error (blocking)** | Spec is definitely wrong |
| `dead_cross_reference` (spec ID doesn't exist) | **error (blocking)** | Broken cross-link |
| `dead_library_reference` (library not installed) | warning | Might be optional/peer dep |
| `empty_rule_target` (rule glob matches nothing) | warning | Files might not exist yet |
| `age_staleness` (spec old, code changed) | warning | Needs human judgment |

**Gate registration in quality-gate.js:**
```
Gate order: typecheck → lint → tests → spec-compliance → doc-freshness → smoke-test → build → security
```

**Remediation when doc-freshness blocks:**

```javascript
{
  primary_violation: "SPEC:auth-001 references src/lib/old-auth.ts but file doesn't exist",
  relevant_spec: "SPEC:auth-001 | backend/jwt-best-practices",
  fix_template: "Update spec SPEC:auth-001: replace reference to src/lib/old-auth.ts with the correct current file path. Check if src/lib/auth.ts or src/lib/authentication.ts exists.",
  learning_signal: "doc-freshness:dead_reference:SPEC:auth-001"
}
```

Agents can fix spec references during execution — the file just moved, the pattern is the same.

---

### 10.2 Automatic Spec Staleness Tracking

When code changes during execution, automatically track which specs might need review.

**New function in `lib/spec-engine.js`:**

```javascript
export function trackSpecStaleness(changedFiles, allSpecs) {
  const staleSpecs = [];

  for (const spec of allSpecs) {
    const specReferences = extractFileReferences(spec.content);
    const specRuleTargets = (spec.data.rules ?? [])
      .filter(r => r.files)
      .map(r => r.files);
    const allTargets = [...specReferences, ...specRuleTargets];

    const affectedFiles = changedFiles.filter(f =>
      allTargets.some(target => minimatch(f, target))
    );

    if (affectedFiles.length > 0) {
      staleSpecs.push({
        specId: spec.data.specId,
        specFile: spec.path,
        affectedFiles,
        lastUpdated: spec.data.updated,
        confidence: affectedFiles.length / Math.max(allTargets.length, 1)
      });
    }
  }

  return staleSpecs;
}
```

**Called from `hooks/post-tool-use.js`**: After each tool call that modifies a file, check if the modified file is referenced by any spec. Write to `spec-staleness-tracker.json`:

```json
{
  "potentially_stale": [
    {
      "specId": "SPEC:auth-001",
      "triggeredBy": "src/lib/auth.ts",
      "changedAt": "2026-03-20T10:30:00Z",
      "specLastUpdated": "2026-03-15",
      "reviewed": false
    }
  ]
}
```

This tracker is:
- Read by `doc-freshness` gate for age-based checks
- Included in handoff Section 4b as "specs needing review"
- Surfaced by `/tw:docs-health` command
- Cleared when user runs `/tw:specs review` and confirms specs are current

---

### 10.3 Spec-Aware Entropy Collector (New Category 7)

Extend the entropy collector's 6 scan categories with a 7th: **Spec Staleness**.

**Addition to `templates/agents/tw-entropy-collector.md`:**

```markdown
### 7. Spec Staleness
Specs that reference files modified in this wave and may need updating.

- Minor: spec references a file modified in wave but changes don't affect the spec's content
  (e.g., formatting, unrelated function changes)
- Warning: spec references a file where changes directly affect patterns the spec documents
  (e.g., function signatures changed, new error types, import patterns modified)

For warning severity:
- Note which spec needs review and what changed
- Do NOT auto-update specs — specs require human review
- Queue as spec-review-needed in the report
```

**How it works**: When a wave modifies code, check if any specs cover that code:

```
Wave diff includes changes to src/lib/auth.ts
    ↓
Which specs reference src/lib/auth.ts or src/lib/auth*?
    ↓
SPEC:auth-001 — JWT Best Practices
    ↓
Did the wave change function signatures, imports, or error handling the spec covers?
    ↓
If yes → issue: "SPEC:auth-001 may be stale after changes to src/lib/auth.ts"
         severity: warning, action: queue spec review
```

---

### 10.4 `/tw:docs-health` Command

Dashboard command showing health of all docs/specs:

```markdown
# Documentation Health Report

## Spec Freshness

| Spec | Last Updated | Files Referenced | Files Changed Since | Status |
|------|-------------|-----------------|-------------------|--------|
| SPEC:auth-001 | 2026-03-15 | 4 | 2 (50%) | ⚠ Review needed |
| SPEC:be-002 | 2026-03-18 | 3 | 0 (0%) | ✅ Fresh |
| SPEC:fe-001 | 2026-02-28 | 8 | 6 (75%) | ❌ Likely stale |

## Reference Integrity

| Issue | Spec | Reference | Status |
|-------|------|-----------|--------|
| Dead file reference | SPEC:auth-001 | src/lib/old-auth.ts | ❌ File not found |
| Dead spec reference | SPEC:fe-001 | SPEC:removed-001 | ❌ Spec ID not found |

## Rule Target Coverage

| Spec | Rule | Glob | Matches |
|------|------|------|---------|
| SPEC:auth-001 | grep_must_exist | src/lib/auth*.ts | 2 files ✅ |
| SPEC:arch-001 | import_boundary | src/services/** | 12 files ✅ |
| SPEC:old-001 | naming_pattern | src/legacy/** | 0 files ⚠ |

## Knowledge Notes Health (see Part 11)

| Note | Scope | Status | Last Verified |
|------|-------|--------|--------------|
| KN-001 | tests/ | ✅ Verified | 2026-03-19 |
| KN-002 | src/lib/auth.ts | ⚠ Unverified | scope changed since discovery |

## Cross-Spec Consistency
No contradictions found. ✅

## Recommendations
1. Review SPEC:auth-001 — 2 referenced files changed since last update
2. Fix dead reference in SPEC:auth-001 — src/lib/old-auth.ts no longer exists
3. Remove or update SPEC:old-001 — rule target matches no files
4. Re-verify KN-002 — scope files changed since note was created
```

---

### 10.5 How It All Connects

```
Code changes (during execution)
    │
    ▼
post-tool-use.js
    │ Track: which specs reference the changed files?
    │ Write to spec-staleness-tracker.json
    │
    ▼
Ralph Loop (subagent-stop.js)
    │ Gate: doc-freshness
    │   ├── Dead file references → BLOCKING (spec is wrong)
    │   ├── Dead spec cross-references → BLOCKING
    │   ├── Dead library references → WARNING
    │   ├── Empty rule targets → WARNING
    │   └── Age staleness → WARNING
    │
    ▼
Wave completes → Entropy Collector
    │ Category 7: Spec Staleness
    │ "Wave changed src/lib/auth.ts — SPEC:auth-001 may need review"
    │ severity: warning, queued for review
    │
    ▼
Verify-phase
    │ Doc-freshness gate runs again (thorough check)
    │ Report includes spec health alongside requirements
    │
    ▼
Handoff
    │ Section 4b: "Specs needing review: SPEC:auth-001 (2 files changed since update)"
    │
    ▼
Next session / User action
    │ /tw:docs-health → full dashboard
    │ /tw:specs review → mark specs as reviewed, update timestamps
    │ Gap aggregation: recurring staleness → auto-propose spec update
```

---

### 10.6 Files Impact

| File | Part | Action |
|------|------|--------|
| `lib/doc-freshness.js` | 10.1 | **Create** — reference integrity checker, age staleness detector, cross-spec consistency validator |
| `lib/quality-gate.js` | 10.1 | Modify — add `runDocFreshness()` to gate sequence, extend `buildRemediationBlock()` for doc-freshness violations |
| `lib/spec-engine.js` | 10.2 | Modify — add `trackSpecStaleness()`, `extractFileReferences()`, `extractSpecReferences()` |
| `hooks/post-tool-use.js` | 10.2 | Modify — track file changes against spec references → write `spec-staleness-tracker.json` |
| `hooks/subagent-stop.js` | 10.1 | Modify — include doc-freshness in gate remediation |
| `templates/agents/tw-entropy-collector.md` | 10.3 | Modify — add category 7: Spec Staleness |
| `templates/commands/tw-docs-health.md` | 10.4 | **Create** — `/tw:docs-health` dashboard command |
| `tests/unit/doc-freshness.test.js` | 10.1 | **Create** — dead references, cross-references, library references, age staleness, rule targets |
| `tests/integration/doc-freshness.test.js` | 10.1-10.3 | **Create** — code change → staleness tracked → gate catches → remediation |

---

## Part 11: Implementation Knowledge Capture (Discussion: 2026-03-20)

### The Problem

During execution, agents discover things about the codebase that aren't documented anywhere. This knowledge dies with the session:

| What's Learned | Where It Lives Today | What Happens Next Session |
|---|---|---|
| "Run `generate-types` before `npm test`" | Nowhere | Next agent hits same error, wastes 2 Ralph Loop retries |
| "Set `NODE_ENV=test` or DB tests hit production" | Maybe handoff note if human remembers | Next agent may not read handoff |
| "Auth middleware silently swallows errors" | Decision log if executor bothered | Decision logs are per-plan, not discoverable |
| "Tests must run sequentially — shared DB" | Remediation log (Ralph Loop failure) | Spec proposal at 0.3, takes 3+ sessions to promote |
| "`UserService.findById()` throws, doesn't return null" | Agent's context window | Completely lost |
| "Webhook endpoint needs `X-Signature` header" | Agent discovered during testing | Lost unless manually documented |

These are **verified, working knowledge** — discovered through actual implementation and testing. More reliable than spec proposals from failure patterns because they come from *success*, not just failure.

### Three Categories of Implementation Knowledge

**Category A: Setup & Workflow Knowledge**
- Build order dependencies (`generate-types` before `test`)
- Required environment variables and their values
- Service dependencies (needs Redis, needs DB seeded)
- Special test commands or flags (`--runInBand`, `--forceExit`)

**Category B: API & Integration Knowledge**
- Function behavior that differs from expectation (throws vs returns null)
- Required headers, auth tokens, rate limits
- Silent failure modes (middleware swallowing errors)
- Undocumented parameters or side effects

**Category C: Edge Cases & Gotchas**
- Test order dependencies
- Race conditions and timing issues
- Platform-specific behavior
- Library version quirks

### Why Existing Systems Don't Capture This

```
Agent discovers knowledge during execution
    │
    ├── Decision log (state.js:appendDecision)
    │     Only captures CHOICES, not DISCOVERIES
    │     Scoped to plan XML — not discoverable across plans
    │
    ├── Spec proposals (ralph-loop failures)
    │     Only triggered by FAILURE, not by success
    │     Starts at confidence 0.3 — slow to promote
    │
    ├── Handoff section 4 (key decisions)
    │     Only auto-populated from <decisions> XML
    │     Human must manually add other knowledge
    │
    ├── Store (cross-session, confidence ≥ 0.7)
    │     Only gets there after long promotion pipeline
    │     Designed for patterns, not operational notes
    │
    └── Lost forever ← most implementation knowledge goes here
```

**The gap**: No way for an agent to say "I learned something useful" and have it captured for future agents.

---

### 11.1 Agent Discovery Protocol

Add a `knowledge_note` virtual tool to the executor template. Agents call it when they discover something useful.

**Addition to `templates/agents/tw-executor.md`:**

```markdown
## Discovery Protocol

During implementation, you will discover things about the codebase that aren't documented.
When you discover something that would help future agents working in this area, emit a
knowledge note by calling the `knowledge_note` tool with:

- **category**: setup | api | edge_case | testing | workflow
- **scope**: file path, directory, or module this applies to
- **summary**: one sentence — what you learned
- **evidence**: how you verified this (test passed, error resolved, etc.)
- **critical**: true if ignoring this will cause failures

Examples:
- category: setup, scope: "tests/", summary: "Tests must run with --runInBand flag
  due to shared DB", evidence: "Parallel run caused failures, sequential passes",
  critical: true
- category: api, scope: "src/lib/auth.ts", summary: "UserService.findById() throws
  NotFoundError instead of returning null", evidence: "Caught during T-1-2-3, wrapped
  in try/catch", critical: false
- category: testing, scope: "src/services/webhook.ts", summary: "Webhook endpoint
  requires X-Signature header computed as HMAC-SHA256 of body",
  evidence: "Discovered via 401 response during integration test", critical: true
```

Also added to `templates/agents/tw-debugger.md` (debugger frequently discovers edge cases).

---

### 11.2 Knowledge Note Interception

`knowledge_note` is a virtual tool intercepted by `hooks/pre-tool-use.js` (same pattern as `spec_fetch` and `store_fetch`):

```javascript
// In hooks/pre-tool-use.js
if (toolName === 'knowledge_note') {
  const note = {
    id: `KN-${Date.now()}`,
    category: payload.category,     // setup | api | edge_case | testing | workflow
    scope: payload.scope,           // file path or directory
    summary: payload.summary,       // one sentence
    evidence: payload.evidence,     // how verified
    critical: payload.critical ?? false,
    discoveredBy: agentName,
    taskId: currentTaskId,
    timestamp: new Date().toISOString(),
    verified: true,                 // agent verified during implementation
    sessionId: sessionId,
    sessionsSurvived: 0,
    promoted: false
  };

  appendKnowledgeNote(note);

  // If critical, inject into routing map for remaining agents this session
  if (note.critical) {
    addToSessionContext(note);
  }

  return { intercept: true, result: `Knowledge note ${note.id} recorded.` };
}
```

---

### 11.3 Knowledge Note Storage

**New file**: `.threadwork/state/knowledge-notes.json`

```json
{
  "_version": "1",
  "_updated": "2026-03-20T10:30:00Z",
  "notes": [
    {
      "id": "KN-1711234567",
      "category": "setup",
      "scope": "tests/",
      "summary": "Tests must run with --runInBand flag due to shared DB",
      "evidence": "Parallel run caused test failures, sequential run passes",
      "critical": true,
      "discoveredBy": "tw-executor",
      "taskId": "T-1-2-3",
      "timestamp": "2026-03-20T10:30:00Z",
      "verified": true,
      "sessionId": "session-001",
      "sessionsSurvived": 2,
      "promoted": false,
      "lastVerifiedAt": "2026-03-20T10:30:00Z"
    }
  ]
}
```

**New module**: `lib/knowledge-notes.js`

```javascript
export function appendKnowledgeNote(note) { /* write to knowledge-notes.json */ }
export function readKnowledgeNotes() { /* read all notes */ }
export function getNotesForScope(scope) { /* filter by scope glob match */ }
export function getCriticalNotes() { /* filter critical: true */ }
export function markNoteVerified(noteId) { /* update verified + lastVerifiedAt */ }
export function markNoteStale(noteId, reason) { /* set verified: false */ }
export function incrementSessionsSurvived(notes) { /* bump counter for all verified notes */ }
```

---

### 11.4 Knowledge Notes in Routing Map

When building the routing map for an agent (`lib/spec-engine.js:buildRoutingMap()`), include relevant knowledge notes alongside specs:

```
── SPEC ROUTING MAP ─────────────────────────────────
Task context: implement webhook handler...
Available specs (fetch by ID when needed):
  [SPEC:be-002]  backend/api-design      — API endpoint patterns
  [SPEC:test-001] testing/standards       — Unit test structure

Implementation notes for this scope:
  ⚠ [KN-critical] src/services/webhook.ts — Webhook endpoint requires X-Signature
    header computed as HMAC-SHA256 of body (verified 2026-03-19)
  [KN] tests/ — Tests must run with --runInBand due to shared DB (verified 2026-03-19)
─────────────────────────────────────────────────────
```

**Display rules:**
- Critical notes: always shown when scope matches task file targets
- Non-critical notes: shown only when scope directly matches task file targets
- Unverified notes (`verified: false`): shown with `⚠ unverified` marker
- Token budget: knowledge notes section capped at ~50 tokens (same as Store injection)

---

### 11.5 Knowledge Note Lifecycle

```
Agent discovers something → knowledge_note tool call
    │
    ▼
knowledge-notes.json (session-scoped capture)
    │ critical notes → injected into same-session agents immediately
    │ all notes → included in routing map for scope-matching tasks
    │
    ▼
Session end → handoff Section 4c
    │ Lists all notes with category, scope, summary, evidence
    │
    ▼
Next session → session-start.js
    │ Inject critical notes from previous sessions (~50 tokens)
    │ "⚠ Previous session learned: Tests must run with --runInBand"
    │ Increment sessionsSurvived for all verified notes
    │
    ▼
Survives 2+ sessions without contradiction
    │ auto-promote to spec proposal at confidence 0.5
    │ if scope matches existing spec → propose amendment
    │ if no spec covers scope → propose new spec
    │
    ▼
Spec system
    │ Normal proposal → acceptance → enforcement pipeline
    │ Knowledge becomes permanent, maintained, freshness-checked (Part 10)
```

---

### 11.6 Automatic Promotion to Specs

Knowledge notes that prove durable get promoted:

```javascript
// lib/knowledge-notes.js
export function promoteKnowledgeNotes(notes, allSpecs) {
  const promotable = notes.filter(n =>
    n.verified &&
    n.sessionsSurvived >= 2 &&
    !n.promoted
  );

  for (const note of promotable) {
    // Find if an existing spec covers this scope
    const existingSpec = allSpecs.find(s =>
      extractFileReferences(s.content).some(ref =>
        note.scope.includes(ref) || ref.includes(note.scope)
      )
    );

    if (existingSpec) {
      // Propose amendment to existing spec
      proposeSpecUpdate(
        existingSpec.data.specId,
        appendKnowledgeToSpec(existingSpec, note),
        `Implementation knowledge: ${note.summary}`,
        { source: 'knowledge-note', initialConfidence: 0.5, noteId: note.id }
      );
    } else {
      // Propose new spec for this scope
      const domain = inferDomain(note.scope);
      proposeSpecUpdate(
        `knowledge/${domain}/${scopeToName(note.scope)}`,
        generateSpecFromNotes(notes.filter(n => n.scope === note.scope)),
        `Discovered knowledge for ${note.scope}`,
        { source: 'knowledge-note', initialConfidence: 0.5, noteId: note.id }
      );
    }

    note.promoted = true;
    note.promotedAt = new Date().toISOString();
  }
}
```

**Grouping**: When multiple notes share the same scope, they're combined into a single spec proposal rather than creating separate proposals per note.

---

### 11.7 Knowledge Note Freshness

Knowledge notes are subject to the same doc-freshness system (Part 10):

```javascript
// In lib/doc-freshness.js — extend
export function checkKnowledgeNoteFreshness(notes, projectRoot) {
  const stale = [];

  for (const note of notes) {
    // Check if scope still exists
    const scopeExists = existsSync(join(projectRoot, note.scope)) ||
      resolveGlob(note.scope, projectRoot).length > 0;

    if (!scopeExists) {
      stale.push({
        noteId: note.id,
        reason: `Scope "${note.scope}" no longer exists`,
        action: 'remove'
      });
      continue;
    }

    // Check if scope files changed since note was created
    const scopeFiles = resolveGlob(note.scope.endsWith('/') ? note.scope + '**' : note.scope, projectRoot);
    const changedSince = scopeFiles.filter(f => {
      const lastMod = getFileLastModifiedFromGit(f, projectRoot);
      return lastMod > new Date(note.lastVerifiedAt ?? note.timestamp);
    });

    if (changedSince.length > 0 && (note.category === 'api' || note.category === 'setup')) {
      stale.push({
        noteId: note.id,
        reason: `${changedSince.length} files in scope changed since note was verified`,
        action: 'reverify'
      });
    }
  }

  return stale;
}
```

**Stale note actions:**
- `remove`: Scope no longer exists → delete the note
- `reverify`: Code changed → set `verified: false`, agent must re-verify next time it works in that scope
- Unverified notes show with `⚠ unverified` marker in routing map

---

### 11.8 Handoff Section 4c

New section in handoff between Section 4b (Environment Gaps) and Section 5 (Files Modified):

```markdown
## 4c. Implementation Knowledge Discovered

### Critical (injected into future sessions automatically)
- [KN-1711234567] **tests/** — Tests must run with --runInBand flag due to shared DB
  Discovered by: tw-executor during T-1-2-3 | Evidence: parallel run failures resolved

- [KN-1711234890] **src/services/webhook.ts** — Webhook requires X-Signature header (HMAC-SHA256)
  Discovered by: tw-executor during T-1-3-1 | Evidence: 401 → 200 after adding header

### Non-Critical
- [KN-1711235000] **src/lib/auth.ts** — UserService.findById() throws, doesn't return null
  Discovered by: tw-executor during T-1-2-1 | Evidence: caught during try/catch wrapping

### Promoted to Specs This Session
- [KN-1711200000] **src/lib/db/** — "Always use parameterized queries" → promoted to SPEC:be-003
  (survived 3 sessions, auto-promoted at confidence 0.5)
```

---

### 11.9 Files Impact

| File | Part | Action |
|------|------|--------|
| `lib/knowledge-notes.js` | 11.1-11.7 | **Create** — note CRUD, promotion logic, freshness checking, routing map integration |
| `hooks/pre-tool-use.js` | 11.2 | Modify — intercept `knowledge_note` virtual tool, inject critical notes into routing map |
| `hooks/session-start.js` | 11.5 | Modify — inject critical knowledge notes from previous sessions, increment sessionsSurvived |
| `hooks/post-tool-use.js` | 11.7 | Modify — track note freshness when files in scope change |
| `lib/doc-freshness.js` | 11.7 | Modify — add `checkKnowledgeNoteFreshness()` |
| `lib/spec-engine.js` | 11.4, 11.6 | Modify — include knowledge notes in `buildRoutingMap()`, add `promoteKnowledgeNotes()` |
| `lib/handoff.js` | 11.8 | Modify — add Section 4c (Implementation Knowledge Discovered) |
| `templates/agents/tw-executor.md` | 11.1 | Modify — add Discovery Protocol section with knowledge_note tool usage |
| `templates/agents/tw-debugger.md` | 11.1 | Modify — add Discovery Protocol (debugger discovers edge cases) |
| `templates/commands/tw-docs-health.md` | 11.7 | Modify — include knowledge note health in dashboard |
| `tests/unit/knowledge-notes.test.js` | 11.1-11.7 | **Create** — note lifecycle, promotion, freshness |
| `tests/integration/knowledge-capture.test.js` | 11.1-11.8 | **Create** — discovery → capture → inject → promote |

---

## Problem 5 Discussion Status: Architectural Coherence (2026-03-20)

Problem 5 was the **first deep dive** and became Part 4 (Mechanical Enforcement Plan). It is Threadwork's most complete coverage of any OpenAI problem:

| Component | Part | Designed |
|---|---|---|
| Spec rules engine (5 rule types) | 4.1 | ✅ with code |
| Structural test gate | 4.2 | ✅ with code |
| Spec compliance quality gate | 4.3 | ✅ with code |
| Enhanced discuss-phase (Q6-Q8) | 4.4 | ✅ |
| Binding constraints (plan-checker → executor) | 4.5 | ✅ with code |
| Enhanced verifier | 4.6 | ✅ |

Additionally covered by:
- **Part 6.1**: Failure classifier with `architectural_violation` category → auto-proposes spec rules
- **Part 8.1**: Readiness audit detects monorepo/workspace structures without boundary specs
- **Part 10.1**: Doc-freshness gate catches stale rule targets

**Open item**: Could offer a **layered architecture template** — a pre-built set of import boundary rules users adopt during discuss-phase (e.g., Types → Config → Repo → Service → Runtime → UI). But discuss-phase Q6 already asks about boundaries, so this is incremental convenience, not a gap.

**Verdict**: No additional design needed. Problem 5 is well covered.

---

## Problem 6 Discussion Status: Garbage Collection (2026-03-20)

Problem 6 was rated **Well Implemented** (entropy collector covers 6 categories). Two remaining gaps addressed in Part 12 below:

1. **Quality trend tracking** — aggregate entropy reports, detect worsening categories, auto-escalate to spec rules
2. **On-demand entropy scan** — `/tw:entropy scan` for ad-hoc health checks outside wave workflow

Additionally, many debt-prevention mechanisms are now mechanical via Parts 4/8/10/11 (spec rules, doc-freshness, readiness audit, knowledge capture).

**Verdict**: Part 12 closes remaining gaps. Problem 6 fully covered.

---

## Problem 7 Discussion Status: Human Judgment Encoding (2026-03-20)

Problem 7 was rated **Well Implemented**. The spec proposal pipeline with confidence escalation is a novel pattern OpenAI doesn't describe. After Parts 4-13, most of OpenAI's practices are covered:

| OpenAI Practice | Threadwork Coverage |
|---|---|
| Capture review comments as doc updates | **Part 11**: Knowledge notes capture agent discoveries. Human review feedback still not captured — addressed below. |
| Promote feedback into tooling | **Part 4**: Spec rules become mechanical enforcement. **Part 6.2**: Proposals from failures auto-promote. |
| Custom linter error messages with remediation | **Part 4.3**: Spec compliance gate with rule-aware remediation blocks. |
| Once encoded, rules apply everywhere | **Part 4.1**: Spec rules apply to all agents via routing map + quality gate. |

**Remaining gap**: Human review feedback → spec proposals. When a human reviews agent output and says "don't do X, do Y," that feedback goes nowhere except the PR comment thread.

### Solution: Review Feedback Capture

**`/tw:feedback` command** — After reviewing agent output, the human captures feedback:

```
User: /tw:feedback "Always use AppError instead of Error in service layer"
  --scope src/services/
  --rule grep_must_not_exist "new Error("
```

This immediately:
- Creates a spec proposal at confidence **0.6** (human-provided = higher than agent-discovered 0.3-0.5)
- If `--rule` provided, includes machine-checkable rule in the proposal
- If `--scope` provided, creates a critical knowledge note for immediate injection
- One step from acceptance at 0.7 — just one confirmation needed

**Milestone audit feedback** — In guided/autonomous mode (Part 13), `/tw:audit-milestone` already asks human to review. Add structured feedback capture:

```
Threadwork: "You're reviewing Phase 2. Any feedback for future phases?"
  [No feedback]  [Add feedback]

User: "API responses should always include a 'requestId' field for traceability"

Threadwork: "Creating spec proposal at confidence 0.6.
  Scope: src/services/ + src/app/api/
  Shall I also create a spec rule? (grep_must_exist for 'requestId')"
```

The milestone audit becomes a natural feedback capture point — human is already reviewing, marginal cost of feedback is low.

**Files for Problem 7:**

| File | Action | Description |
|------|--------|-------------|
| `templates/commands/tw-feedback.md` | **Create** | `/tw:feedback` command |
| `lib/spec-engine.js` | Modify | Accept human feedback source with confidence 0.6 |
| `templates/commands/tw-audit-milestone.md` | Modify | Add structured feedback capture step |

**Verdict**: `/tw:feedback` command + milestone audit integration close the remaining gap. Problem 7 fully covered.

---

## Problem 8 Discussion Status: PR Velocity vs Quality Gates (2026-03-20)

Problem 8 was rated **Conservative Approach (Low priority)**. Threadwork's blocking Ralph Loop is the right default for most teams. OpenAI's "minimal blocking gates" works because their agents fix things faster than humans can review — irresponsible in low-throughput environments by their own admission.

**Part 13 (Autonomous Mode) addresses most of this:**

| OpenAI Practice | Part 13 Coverage |
|---|---|
| Minimal blocking gates | Autonomous: Ralph Loop skips-and-logs after 10 retries |
| Corrections are cheap, waiting expensive | Autonomous: proceed on verification failure, attempt auto-fix |
| Short-lived PRs | Not directly addressed — Threadwork doesn't manage PR workflow |
| Test flake tolerance | Not addressed — addressed below |

### Remaining Gap: Flake Tolerance

Test flakes are a real problem with agent-generated code. A test might fail due to timing, network, or shared state rather than actual bugs. Currently every test failure triggers the Ralph Loop, burning retries on flakes.

**Flake detection**: If the same test fails, then passes on immediate re-run without code changes, it's a flake.

```javascript
// In lib/quality-gate.js — extend runTests()
export function runTests(filter, options = {}) {
  const result = runTestsOnce(filter);

  if (!result.passed && options.flakyRetries > 0) {
    // Re-run failed tests without code changes
    const rerunResult = runTestsOnce(filter);
    if (rerunResult.passed) {
      return {
        ...rerunResult,
        passed: true,
        flakyTests: result.failures,
        warning: `${result.failures.length} flaky test(s) detected — passed on re-run`
      };
    }
  }

  return result;
}
```

**Configuration in `quality-config.json`:**

```json
{
  "tests": {
    "enabled": true,
    "blocking": true,
    "flakyRetries": 1,
    "flakyThreshold": 3
  }
}
```

- `flakyRetries`: how many times to re-run failed tests before declaring real failure (default: 1)
- `flakyThreshold`: after a test is detected as flaky N times, add to flaky test tracker

**Flaky test tracker** — `.threadwork/state/flaky-tests.json`:

```json
{
  "tests": [
    {
      "name": "auth > refresh token > should handle concurrent refresh",
      "occurrences": 3,
      "firstSeen": "2026-03-15",
      "lastSeen": "2026-03-20"
    }
  ]
}
```

**Surfaced in:**
- Handoff: "3 flaky tests detected this session"
- `/tw:docs-health`: flaky test trend
- Gap report: recurring flaky tests as `testing_gap` entries

### Gate Strictness CLI

`quality-config.json` already has `blocking: boolean` per gate. Add CLI control via `/tw:autonomy`:

```
/tw:autonomy gate security non-blocking
/tw:autonomy gate tests blocking
/tw:autonomy gate endpoint-verification non-blocking
```

**Files for Problem 8:**

| File | Action | Description |
|------|--------|-------------|
| `lib/quality-gate.js` | Modify | Add flaky retry logic to `runTests()`, write flaky-tests.json |
| `templates/commands/tw-autonomy.md` | Modify | Add `gate` subcommand for strictness control |

**Verdict**: Flake detection + gate strictness CLI + Part 13 autonomy levels fully cover Problem 8.

---

## Problem 9 Discussion Status: Agent-to-Agent Review (2026-03-20)

Problem 9 was rated **High Priority** — the last major gap. OpenAI pushes "almost all review effort" to agent-to-agent loops. Threadwork's current review is structural (lint/type/test), not semantic (does the code do what was asked, is the design clean, does it match spec intent).

### What's Missing

The verifier (tw-verifier) checks at phase end whether requirements are met. The gap is **per-task semantic review before quality gates**, catching things quality gates can't:

- Function does the wrong thing but passes tests (tests are incomplete)
- Code works but uses an anti-pattern the specs discourage
- Implementation is correct but design is fragile (tight coupling, no edge case handling)
- Code duplicates existing functionality the agent didn't discover
- Code technically passes spec rules but misses the spirit

### Solution: tw-reviewer Agent (10th Agent)

A new agent that reviews executor output **between execution and the Ralph Loop quality gates**:

```
Executor completes task
    │
    ▼
tw-reviewer examines the diff              ← NEW
    │ Checks: semantic correctness, spec intent,
    │ design quality, duplication, edge cases
    │
    ├── Approve → proceed to Ralph Loop quality gates
    │
    └── Request changes → feedback to executor
          │ Executor revises based on feedback
          │ Re-submit to tw-reviewer
          │ Loop up to 2 iterations
          │
          ▼
        Ralph Loop quality gates (lint/type/test/spec-compliance/doc-freshness)
```

### What tw-reviewer Checks (That Quality Gates Can't)

| Check | What It Catches | Example |
|-------|----------------|---------|
| **Requirement alignment** | Code doesn't match `<done-condition>` | Function returns null but done-condition says throw NotFoundError |
| **Spec intent compliance** | Code violates spirit of spec, not just letter | Spec says "use repository pattern" but code puts SQL in controller |
| **Design quality** | Hardcoded values, missing edge case handling, tight coupling | API key hardcoded instead of from config, no error handling on network calls |
| **Duplication detection** | Reinventing existing utilities | New `formatDate()` when `src/utils/date.ts` already exports `formatISO()` |
| **Knowledge note check** | Ignoring discovered knowledge | Knowledge note says "findById throws" but code assumes it returns null |

### Agent Template

**File**: `templates/agents/tw-reviewer.md`

```markdown
# tw-reviewer — Code Review Analyst

## Role
You are the Code Review Analyst for Threadwork. You review executor output for
semantic correctness, design quality, and spec compliance BEFORE quality gates run.

You are Sonnet-class. You see the task diff, the task spec, and relevant specs.
Your job is to catch issues that lint/type/test cannot: wrong behavior, bad design,
missed edge cases, duplicated functionality.

## Inputs
- **task_diff**: git diff of files changed by the executor for this task
- **task_spec**: the `<task>` XML block from the plan (description, files, verification, done-condition)
- **relevant_specs**: specs matching the task's file targets (from routing map)
- **knowledge_notes**: critical + scope-matching notes for changed files
- **existing_utilities**: list of exports from src/lib/, src/utils/, src/helpers/

## Review Checklist

### 1. Requirement Alignment
Does the code satisfy the task's `<done-condition>`?
- Read the done-condition carefully
- Trace through the code to verify behavior matches
- Flag if code does something adjacent but not exactly what was asked

### 2. Spec Intent
Do relevant specs prescribe patterns that should be followed here?
- Check if code follows the spec's recommended approach, not just avoids violations
- Flag if code technically passes spec rules but misses the spirit

### 3. Design Quality
- Hardcoded values that should be constants or config?
- Error handling present for likely failure modes?
- Tight couplings that could be avoided?
- Is the code testable in isolation?

### 4. Duplication Check
- Compare new functions against existing_utilities
- Flag if a new helper duplicates existing functionality
- Suggest using existing utility instead

### 5. Knowledge Note Check
- Do any knowledge notes warn about patterns in these files?
- Is the code consistent with discovered knowledge?

## Output Format

**APPROVE** — no semantic issues:
{ "decision": "approve", "notes": "optional brief comment" }

**REQUEST_CHANGES** — issues found:
{
  "decision": "request_changes",
  "issues": [
    {
      "type": "requirement_alignment|spec_intent|design_quality|duplication|knowledge",
      "file": "src/services/auth.ts",
      "line": 42,
      "description": "Function returns null but done-condition says throw NotFoundError",
      "suggestion": "throw new NotFoundError(`User ${id} not found`)"
    }
  ]
}

## Constraints
- Maximum 2 review iterations per task (avoid infinite loops)
- If issues are minor and non-blocking, APPROVE with notes rather than requesting changes
- Do not duplicate what quality gates check — skip lint, type, and test concerns
- Target: complete review in under 10,000 tokens
```

### When tw-reviewer Runs

Not on every task — that would be expensive. Configurable in `project.json`:

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

- `all`: review every task (highest quality, most expensive)
- `selective`: review only tasks matching triggers (balanced — default)
- `off`: skip review entirely (fastest, relies on quality gates only)

**Autonomy level affects defaults:**
- **Supervised**: selective (default triggers)
- **Guided**: selective (same)
- **Autonomous**: all (compensates for less human review)

### Integration in subagent-stop.js

The reviewer runs **before** quality gates in the Ralph Loop:

```javascript
// In hooks/subagent-stop.js — new section before quality gate execution

if (reviewEnabled && shouldReview(taskContext)) {
  const reviewResult = await spawnReviewer({
    taskDiff: getTaskDiff(),
    taskSpec: currentTaskXml,
    relevantSpecs: getRelevantSpecs(taskContext),
    knowledgeNotes: getNotesForScope(taskContext.files),
    existingUtilities: scanExistingUtilities()
  });

  if (reviewResult.decision === 'request_changes') {
    const reviewPrompt = formatReviewFeedback(reviewResult.issues);
    writeRalphState({ ...ralph, reviewIteration: (ralph.reviewIteration ?? 0) + 1 });

    if ((ralph.reviewIteration ?? 0) < 2) {
      // Re-invoke executor with review feedback
      process.stdout.write(JSON.stringify({
        action: 'block',
        retry: true,
        message: reviewPrompt,
        source: 'tw-reviewer'
      }));
      return;
    }
    // Max review iterations reached — proceed to quality gates
    logHook('WARNING', 'tw-reviewer: max iterations reached, proceeding to gates');
  }
}

// Then run quality gates as before
const gateResult = await runAll({ skipCache: true });
```

### Review Feedback Format

When the reviewer requests changes:

```
CODE REVIEW FEEDBACK (iteration 1 of 2)

Issues found by tw-reviewer:

1. [requirement_alignment] src/services/auth.ts:42
   Function returns null on not-found but done-condition says it should throw NotFoundError.
   Suggestion: throw new NotFoundError(`User ${id} not found`)

2. [duplication] src/lib/helpers/format-date.ts
   This duplicates existing function formatISO() in src/utils/date.ts.
   Suggestion: Import and use formatISO() instead of creating a new helper.

Please address these issues and resubmit.
```

### Review Results in Reports

Review outcomes tracked and surfaced in:
- **execution-log.json**: review decisions per task
- **SUMMARY.md**: "2 tasks reviewed, 1 had issues resolved in 1 iteration"
- **Handoff Section 8**: "Review: 5 tasks reviewed, 3 approved immediately, 2 revised"
- **Entropy trends**: review rejection patterns as data point
- **Knowledge notes**: reviewer can emit `knowledge_note` calls for discoveries during review

### Updated Agent Roster (10 Agents)

| Agent | Model | Role | Trigger |
|-------|-------|------|---------|
| tw-planner | Opus | Generates XML plans | `/tw:plan-phase N` |
| tw-researcher | Opus | Domain research | `/tw:discuss-phase N` |
| tw-executor | Sonnet | Implements tasks | Wave execution |
| tw-verifier | Sonnet | Goal-backward verification | `/tw:verify-phase N` |
| tw-plan-checker | Sonnet | Validates plans (6 dimensions) | Auto, post-planning |
| **tw-reviewer** | **Sonnet** | **Semantic code review** | **Pre-gate, selective/all** |
| tw-debugger | Opus | Hypothesis-driven debugging | `/tw:debug` |
| tw-dispatch | Haiku | Parallel work coordinator | Wave orchestration |
| tw-spec-writer | Haiku | Extracts patterns → proposals | Auto, pattern detection |
| tw-entropy-collector | Haiku | Post-wave drift scan | Post-wave |

### Files for Problem 9

| File | Action | Description |
|------|--------|-------------|
| `templates/agents/tw-reviewer.md` | **Create** | Code review analyst — semantic review, spec intent, design quality, duplication |
| `hooks/subagent-stop.js` | Modify | Add pre-gate review step, reviewer spawn, review iteration tracking |
| `lib/quality-gate.js` | Modify | Expose `scanExistingUtilities()` for duplication check input |
| `templates/commands/tw-execute-phase.md` | Modify | Document review step in execution flow |
| `tests/unit/reviewer-integration.test.js` | **Create** | Review triggering, iteration limits, feedback formatting |
| `tests/integration/agent-review.test.js` | **Create** | Full flow: execute → review → feedback → revise → gates |

**Verdict**: tw-reviewer agent closes the last High Priority gap. Problem 9 fully covered.

---

## Part 12: Enhanced Garbage Collection (Discussion: 2026-03-20)

### Current State

Threadwork's entropy collector already covers the core of OpenAI's "garbage collection" approach — 6 scan categories, auto-fix for minor issues, queuing for warnings. With Parts 4/8/10/11, many debt-prevention mechanisms are now mechanical (spec rules, doc-freshness, knowledge capture).

### Remaining Gaps

Two additions to close the remaining gap:

### 12.1 Quality Trend Tracking

The entropy collector produces per-wave reports but there's no aggregation. Over 10 waves, is naming drift increasing or decreasing?

**New file**: `.threadwork/state/entropy-trends.json`

```json
{
  "_version": "1",
  "_updated": "2026-03-20T10:30:00Z",
  "trends": {
    "naming_drift": [
      { "wave": 1, "phase": 1, "count": 3 },
      { "wave": 2, "phase": 1, "count": 1 },
      { "wave": 1, "phase": 2, "count": 0 }
    ],
    "import_boundary_violation": [
      { "wave": 1, "phase": 1, "count": 0 },
      { "wave": 2, "phase": 1, "count": 2 },
      { "wave": 1, "phase": 2, "count": 4 }
    ]
  },
  "worsening_categories": ["import_boundary_violation"],
  "improving_categories": ["naming_drift"],
  "stable_categories": ["orphaned_artifact", "duplicate_logic"]
}
```

**New function in `lib/entropy-collector.js`:**

```javascript
export function updateTrends(entropyReport) {
  const trends = readTrends();
  for (const issue of entropyReport.issues ?? []) {
    const category = issue.type;
    if (!trends.trends[category]) trends.trends[category] = [];
    // Increment count for this wave/phase, or add new entry
    const existing = trends.trends[category].find(
      t => t.wave === entropyReport.wave && t.phase === entropyReport.phase
    );
    if (existing) existing.count++;
    else trends.trends[category].push({
      wave: entropyReport.wave, phase: entropyReport.phase, count: 1
    });
  }
  // Classify direction per category (last 3 data points)
  trends.worsening_categories = Object.entries(trends.trends)
    .filter(([, data]) => isWorsening(data.slice(-3)))
    .map(([cat]) => cat);
  trends.improving_categories = Object.entries(trends.trends)
    .filter(([, data]) => isImproving(data.slice(-3)))
    .map(([cat]) => cat);
  writeTrends(trends);
  return trends;
}
```

**Auto-escalation**: When a category worsens across 3+ consecutive data points, auto-propose a spec rule to prevent it mechanically:

```javascript
if (trends.worsening_categories.includes('import_boundary_violation')) {
  // Bridge from advisory (entropy report) to enforcement (spec rule)
  proposeSpecUpdate(
    'enforcement/import-boundaries',
    generateImportBoundarySpec(recentViolations),
    'Recurring import boundary violations detected by entropy collector',
    { source: 'entropy-trend', initialConfidence: 0.5 }
  );
}
```

**Surfaced in:**
- `/tw:entropy` command — shows trend charts
- Handoff Section 8 (Quality Gate Status) — "Worsening: import violations (0 → 2 → 4)"
- Session-start — if worsening categories exist: "⚠ Import boundary violations trending up — consider adding spec rules"

### 12.2 On-Demand Entropy Scan

Instead of scheduled cadence (doesn't fit session model), add `/tw:entropy scan` that runs the entropy collector against the full recent diff — not just wave diff.

**When to use:**
- Before a release or merge to main
- During code review
- At session start to assess current state
- Anytime the user wants a health check

**Implementation**: Reuse the existing entropy collector agent but with different inputs:

```javascript
// In templates/commands/tw-entropy.md — add 'scan' subcommand
// /tw:entropy scan [--since <sha|tag|date>]

// Default: diff since last handoff or last 20 commits
// --since: custom starting point

const diff = execSync(`git diff ${since}..HEAD`, { encoding: 'utf8' });
const changedFiles = execSync(`git diff --name-only ${since}..HEAD`, { encoding: 'utf8' })
  .split('\n').filter(Boolean);

// Spawn entropy collector with full diff instead of wave diff
spawnEntropyCollector({
  waveDiff: diff,
  changedFiles,
  tasteInvariants: loadTasteInvariants(),
  mode: 'on-demand',  // vs 'post-wave'
  waveId: 'scan',
  phaseId: currentPhase
});
```

Output saved as `entropy-report-scan-{timestamp}.json` alongside wave reports.

---

### 12.3 Files Impact

| File | Part | Action |
|------|------|--------|
| `lib/entropy-collector.js` | 12.1 | Modify — add `updateTrends()`, `readTrends()`, trend classification |
| `templates/commands/tw-entropy.md` | 12.2 | Modify — add `scan` subcommand with `--since` option |
| `hooks/post-tool-use.js` | 12.1 | Modify — call `updateTrends()` after entropy report is written |
| `tests/unit/entropy-trends.test.js` | 12.1 | **Create** — trend tracking, worsening detection, auto-escalation |

---

## Part 13: Autonomous Operation Mode (Discussion: 2026-03-20)

### The Vision

As AI capabilities improve, the human role shifts from reviewing every step to reviewing final results. OpenAI's article already describes this:

> "In a system where agent throughput far exceeds human attention, corrections are cheap, and waiting is expensive."

Currently Threadwork requires human interaction at many points. The question is: **can Threadwork operate with minimal human involvement, deferring all review to the end?**

### Current Human Interaction Points

| Interaction Point | When | What Human Does | Blocking? |
|---|---|---|---|
| `/tw:discuss-phase` | Before planning | Answer 10 questions about preferences, constraints, rules | Yes |
| Plan review | After planning | Review plan-checker report, approve plans | Yes |
| `/tw:execute-phase` | During execution | Monitor progress, respond to escalations | Partially |
| Ralph Loop escalation | After 5 retries | Manually fix what agents couldn't | Yes |
| Model switch approval | During execution (notify/approve policy) | Accept or reject model change | Depends on policy |
| `/tw:specs proposals` | After execution | Accept/reject spec proposals | No (proposals queue) |
| `/tw:verify-phase` | After execution | Review verification report | Yes |
| `/tw:verify-manual` | After verification | Run manual checks, report results | Yes (if critical) |
| `/tw:done` | Session end | Review handoff, confirm | Yes |

That's **9 interaction points** per phase. For a milestone with 5 phases, that's ~45 human touchpoints.

### Three Autonomy Levels

New setting in `project.json`:

```json
{
  "autonomyLevel": "supervised" | "guided" | "autonomous"
}
```

#### Level 1: Supervised (Current Default)

Human approves every step. All current interaction points remain. This is the right mode for:
- New projects where specs/rules aren't established yet
- Critical systems (financial, medical, security)
- Teams new to Threadwork

#### Level 2: Guided

Human sets direction, AI executes with checkpoints. Reduces 9 interaction points to 3:

| Interaction | Supervised | Guided |
|---|---|---|
| Discuss-phase questions | Human answers all 10 | **Auto-fill from previous phase CONTEXT.md + project.json. Only ask if NEW questions arise (first time asking about arch boundaries, etc.)** |
| Plan review | Human reviews | **Auto-approve if plan-checker passes all 6 dimensions. Human notified but not blocked.** |
| Execution monitoring | Human watches | **Auto-proceed. Escalation only at Ralph Loop max retries.** |
| Ralph Loop escalation | After 5 retries | **Increase to 8 retries before escalation. Log gap report entry.** |
| Model switch | notify/approve | **Always auto (silent switch, logged).** |
| Spec proposals | Human reviews each | **Auto-accept proposals at confidence ≥ 0.6 (instead of requiring 0.7).** |
| Verify-phase | Human reviews report | **Auto-proceed if all gates pass + all requirements covered. Human reviews only failures.** |
| Manual verification | Human runs checks | **Defer to end of milestone. Aggregate all UAT.md into single review.** |
| Session end | Human reviews handoff | **Auto-generate handoff. Auto-resume next session.** |

**Human interaction in Guided mode:**
1. **Phase start**: Review auto-filled context, adjust if needed (optional — can skip)
2. **Failures**: Only when Ralph Loop exhausts 8 retries or verification fails
3. **Milestone end**: Review aggregated manual checks + full milestone verification

#### Level 3: Autonomous

AI drives the entire milestone. Human reviews only the final output. For:
- Well-established projects with mature spec libraries
- Non-critical features or prototypes
- Situations where the developer wants to "sleep on it" and review in the morning

| Interaction | Guided | Autonomous |
|---|---|---|
| Discuss-phase | Auto-fill, ask if new | **Fully auto-fill. Use project defaults + previous CONTEXT.md. No questions.** |
| Plan review | Auto-approve if checker passes | **Same** |
| Ralph Loop | 8 retries | **10 retries. On max retries: skip task, log gap, continue to next task.** |
| Spec proposals | Auto-accept at 0.6 | **Auto-accept at 0.5. Auto-generate rules from proposals.** |
| Verification | Auto-proceed if pass | **Same. On failure: attempt auto-fix via debugger (up to 3 attempts), then skip and log.** |
| Manual verification | Defer to milestone end | **Skip entirely. All verification is automated.** |
| Session boundaries | Auto-handoff/resume | **Auto-chain sessions. When budget exhausted, handoff and auto-resume.** |

**Human interaction in Autonomous mode:**
1. **Milestone end**: Review everything at once — code, verification report, gap report, entropy trends
2. **Critical escalation**: Only if the entire milestone fails verification

### How Autonomy Level Affects Each System

#### Discuss-Phase (Part 4.4)

```javascript
// In templates/commands/tw-discuss-phase.md
if (autonomyLevel === 'supervised') {
  // Ask all 10 questions
} else if (autonomyLevel === 'guided') {
  // Auto-fill from previous CONTEXT.md + project.json
  // Only ask questions where no previous answer exists
  const previousContext = readPreviousPhaseContext(phaseId - 1);
  const unanswered = questions.filter(q => !previousContext[q.key]);
  if (unanswered.length > 0) askQuestions(unanswered);
  else proceedWithDefaults();
} else if (autonomyLevel === 'autonomous') {
  // Fully auto-fill, no questions
  proceedWithDefaults();
}
```

#### Plan Approval (Part 4.5)

```javascript
// In templates/commands/tw-plan-phase.md
const checkReport = await runPlanChecker(plans);

if (autonomyLevel === 'supervised') {
  // Always show report and wait for approval
  presentToUser(checkReport);
  awaitApproval();
} else {
  // guided + autonomous: auto-approve if all 6 dimensions pass
  if (checkReport.allDimensionsPass) {
    logAutoApproval(checkReport);
    proceed();
  } else {
    if (autonomyLevel === 'guided') {
      // Show failures, ask for approval
      presentToUser(checkReport);
      awaitApproval();
    } else {
      // autonomous: attempt auto-fix up to 3 times, then proceed with warnings
      const fixed = await autoFixPlanIssues(checkReport, maxAttempts: 3);
      if (fixed.allDimensionsPass) proceed();
      else { logWarning(fixed); proceed(); }  // proceed anyway, log issues
    }
  }
}
```

#### Ralph Loop (Part 6.1)

```javascript
// In hooks/subagent-stop.js
const maxRetries = {
  supervised: 5,
  guided: 8,
  autonomous: 10
}[autonomyLevel];

// On max retries:
if (retries > maxRetries) {
  if (autonomyLevel === 'autonomous') {
    // Don't block — skip task, log gap, continue
    appendGapReport({
      type: 'max_retries_exceeded',
      taskId: currentTaskId,
      description: `Task failed after ${maxRetries} retries`,
      classification: classification.type,
      action: 'skipped'
    });
    skipTask(currentTaskId);
    clearRalphState();
    process.stdout.write(JSON.stringify({ action: 'allow' }));
  } else {
    // supervised + guided: escalate to human
    escalateToUser();
  }
}
```

#### Spec Proposals (Part 6.2)

```javascript
// Auto-acceptance thresholds by autonomy level
const autoAcceptThreshold = {
  supervised: 0.7,   // only human-accepted proposals
  guided: 0.6,       // accept faster
  autonomous: 0.5    // accept much faster
}[autonomyLevel];

if (proposal.confidence >= autoAcceptThreshold) {
  acceptProposal(proposal);
  if (proposal.proposedRules) {
    activateRules(proposal.proposedRules);  // immediate enforcement
  }
}
```

#### Verification (Part 4.6, 9.4-9.5)

```javascript
// In templates/commands/tw-verify-phase.md
if (autonomyLevel === 'autonomous') {
  // On verification failure: attempt auto-fix
  if (!verificationPassed) {
    const debugResult = await spawnDebugger(failures, maxAttempts: 3);
    if (debugResult.fixed) {
      rerunVerification();
    } else {
      // Skip and log — don't block
      logVerificationSkip(failures);
      markPhaseAsPartiallyVerified();
    }
  }
  // Skip manual verification entirely
  skipManualVerification();
} else if (autonomyLevel === 'guided') {
  // Defer manual verification to milestone end
  deferManualVerification();
}
```

#### Session Chaining (Autonomous Only)

In autonomous mode, when a session's token budget is exhausted:

```javascript
// In hooks/post-tool-use.js — budget threshold check
if (autonomyLevel === 'autonomous' && budgetPercent >= 95) {
  // Auto-handoff
  const handoff = generateHandoff(sessionData);

  // Write auto-resume marker
  writeAutoResumeMarker({
    handoffFile: handoff.filename,
    nextAction: handoff.nextAction,
    remainingTasks: getRemainingTasks(),
    autoResume: true
  });

  // The next session-start.js detects the marker and auto-resumes
}

// In hooks/session-start.js
const resumeMarker = readAutoResumeMarker();
if (resumeMarker?.autoResume && autonomyLevel === 'autonomous') {
  // Auto-resume from where we left off — no human prompt needed
  injectResumeContext(resumeMarker);
}
```

### Milestone-Level Review (Autonomous + Guided)

When operating in guided or autonomous mode, defer comprehensive review to milestone boundaries. New command `/tw:audit-milestone` becomes the primary human review point:

```markdown
# Milestone 1 Audit Report

## Phases Completed: 3 of 3

## Code Changes
- 47 files modified across 3 phases
- 12 commits, all quality gates passed
- Branch: feature/auth-system

## Automated Verification: 94% pass rate
| Phase | Requirements | Gates | Spec Compliance | Profile Checks |
|-------|-------------|-------|----------------|----------------|
| 1 | 8/8 ✅ | All pass | All pass | 3/3 pass |
| 2 | 6/6 ✅ | All pass | All pass | 3/3 pass |
| 3 | 5/6 ⚠ | Tests pass | 1 warning | 2/3 pass |

## Items Requiring Human Review
1. **REQ-018 partially met** (Phase 3) — rate limiting implemented but threshold
   not configurable. Agent decision: hardcoded at 100 req/min.
2. **Profile check warning** (Phase 3) — manifest.json missing optional "fundingUrl" field
3. **2 spec proposals auto-accepted** — review SPEC:be-004 and SPEC:test-003

## Aggregated Manual Verification (deferred from Phases 1-3)
[ ] Auth flow: register → login → refresh → logout
[ ] Error responses match API spec
[ ] Rate limiting returns 429 with Retry-After header
[ ] Plugin loads in Obsidian without console errors

## Knowledge Discovered (11 notes across 3 phases)
- 3 critical notes (already in routing map)
- 5 promoted to spec proposals
- 3 non-critical (informational)

## Entropy Trends
- Naming drift: improving (3 → 1 → 0)
- Import violations: stable (0 → 0 → 1)
- No worsening categories

## Environment Gaps (aggregated)
- 2 knowledge gaps resolved via spec proposals
- 1 missing capability: no database seed script (logged, not blocking)
```

This is the **single review point** — the human reads this, runs the manual checks, reviews the auto-accepted proposals, and either approves the milestone or requests changes.

### Configuration

```json
// project.json
{
  "autonomyLevel": "supervised",  // default

  // Fine-grained overrides (optional)
  "autonomy": {
    "discuss_phase": "auto_fill",      // auto_fill | ask_new_only | ask_all
    "plan_approval": "auto_if_pass",   // auto_if_pass | always_ask
    "ralph_max_retries": 8,            // override default for level
    "spec_auto_accept_threshold": 0.6, // override default for level
    "model_switch_policy": "auto",     // auto | notify | approve
    "manual_verification": "defer",    // immediate | defer | skip
    "session_chaining": false,         // true for auto-resume
    "on_max_retries": "escalate"       // escalate | skip_and_log
  }
}
```

Users can set the level with `/tw:autonomy guided` or configure individual overrides.

### Safety Rails (All Levels)

Even in autonomous mode, certain things always require human action:

1. **Git push / PR creation** — never automatic, always requires explicit human command
2. **Destructive operations** — deleting branches, resetting, force-push
3. **Security-sensitive changes** — auth, encryption, credentials (detected via keyword matching)
4. **Budget exceeded** — session budget exhausted, handoff generated (autonomous auto-resumes but respects budget)
5. **Quality gate configuration changes** — changing what's blocking/non-blocking
6. **Autonomy level changes** — can only be changed by human, never by agent

---

### 13.1 Files Impact

| File | Part | Action |
|------|------|--------|
| `lib/autonomy.js` | 13 | **Create** — autonomy level reader, threshold calculator, auto-approval logic, session chaining |
| `hooks/subagent-stop.js` | 13 | Modify — autonomy-aware max retries, skip-and-log on autonomous max retries |
| `hooks/session-start.js` | 13 | Modify — auto-resume from marker in autonomous mode |
| `hooks/post-tool-use.js` | 13 | Modify — auto-handoff at 95% budget in autonomous mode |
| `hooks/pre-tool-use.js` | 13 | Modify — auto-approve model switches per autonomy level |
| `lib/spec-engine.js` | 13 | Modify — auto-accept proposals per autonomy threshold |
| `templates/commands/tw-discuss-phase.md` | 13 | Modify — auto-fill logic per autonomy level |
| `templates/commands/tw-plan-phase.md` | 13 | Modify — auto-approve plans per autonomy level |
| `templates/commands/tw-execute-phase.md` | 13 | Modify — autonomy-aware execution flow |
| `templates/commands/tw-verify-phase.md` | 13 | Modify — auto-proceed on pass, defer manual checks per level |
| `templates/commands/tw-autonomy.md` | 13 | **Create** — `/tw:autonomy` command to set level |
| `templates/commands/tw-audit-milestone.md` | 13 | Modify — enhanced milestone audit as primary review point |
| `tests/unit/autonomy.test.js` | 13 | **Create** — level thresholds, auto-approval, session chaining |
| `tests/integration/autonomous-flow.test.js` | 13 | **Create** — full autonomous phase: discuss → plan → execute → verify without human |

---

## Part 14: Complete Files Manifest (All Parts)

| File | Parts | Action |
|------|-------|--------|
| `lib/rule-evaluator.js` | 4.1 | **Create** — rule evaluation engine (5 types) |
| `lib/verification-profile.js` | 9.3 | **Create** — profile loader, profile-aware check runner, manual check tracker |
| `lib/doc-freshness.js` | 10.1, 11.7 | **Create** — reference integrity checker, age staleness detector, knowledge note freshness |
| `lib/knowledge-notes.js` | 11.1-11.7 | **Create** — note CRUD, promotion logic, freshness checking, routing map integration |
| `lib/autonomy.js` | 13 | **Create** — autonomy level reader, threshold calculator, auto-approval, session chaining |
| `lib/spec-engine.js` | 4.1, 6.2, 8.1, 8.2, 10.2, 11.4, 11.6, 13 | Modify — `loadRules()`, `wasSpecFetchedThisSession()`, `initialConfidence`, `auditHarnessReadiness()`, `scanPlanForGaps()`, `generateDraftSpecForGap()`, `trackSpecStaleness()`, `extractFileReferences()`, knowledge notes in routing map, `promoteKnowledgeNotes()`, auto-accept per autonomy threshold |
| `lib/quality-gate.js` | 4.3, 6.1, 9.1, 9.2, 9.6, 10.1 | Modify — `runSpecCompliance()`, `runStructuralTests()`, `classifyFailure()`, `runSmokeTest()`, `runEndpointVerification()`, `runProfileChecks()`, `runDocFreshness()`, extend `runAll()` and `buildRemediationBlock()` |
| `lib/entropy-collector.js` | 12.1 | Modify — `updateTrends()`, trend classification, auto-escalation to spec rules |
| `lib/state.js` | 6.3, 8.3 | Modify — `appendGapReport()`, `readGapReport()`, `aggregateGaps()` |
| `lib/handoff.js` | 6.3, 11.8 | Modify — add Section 4b (Environment Gaps), Section 4c (Implementation Knowledge) |
| `hooks/subagent-stop.js` | 4.3, 6.1, 6.2, 6.3, 10.1, 13 | Modify — classification-aware retry, proposal, gap reporting, doc-freshness remediation, autonomy-aware retries |
| `hooks/pre-tool-use.js` | 4.5, 11.2, 13 | Modify — inject `<constraints>`, intercept `knowledge_note`, auto-approve model switches per autonomy |
| `hooks/post-tool-use.js` | 10.2, 11.7, 12.1, 13 | Modify — track spec staleness, track knowledge note freshness, update entropy trends, auto-handoff in autonomous mode |
| `hooks/session-start.js` | 8.3, 11.5, 13 | Modify — inject gap warnings, inject knowledge notes, increment sessionsSurvived, auto-resume in autonomous mode |
| `templates/commands/tw-discuss-phase.md` | 4.4, 9.3.1, 13 | Modify — add questions 6-10, auto-generate spec rules, profile loading, autonomy auto-fill |
| `templates/commands/tw-plan-phase.md` | 13 | Modify — auto-approve per autonomy level |
| `templates/commands/tw-execute-phase.md` | 8.2, 13 | Modify — pre-execution gap scan, autonomy-aware execution |
| `templates/commands/tw-analyze-codebase.md` | 8.1 | Modify — harness readiness audit |
| `templates/commands/tw-readiness.md` | 8.1 | **Create** — `/tw:readiness` command |
| `templates/commands/tw-verify-phase.md` | 4.6, 9.4, 13 | Modify — review criteria, profile-aware UAT, auto-proceed per autonomy |
| `templates/commands/tw-verify-manual.md` | 9.5 | **Create** — `/tw:verify-manual` structured feedback |
| `templates/commands/tw-docs-health.md` | 10.4, 11.7 | **Create** — `/tw:docs-health` dashboard |
| `templates/commands/tw-entropy.md` | 12.2 | Modify — add `scan` subcommand |
| `templates/commands/tw-feedback.md` | P7 | **Create** — `/tw:feedback` human review feedback capture |
| `templates/commands/tw-autonomy.md` | 13 | **Create** — `/tw:autonomy` level command |
| `templates/commands/tw-audit-milestone.md` | 13, P7 | Modify — enhanced milestone audit + structured feedback capture |
| `templates/agents/tw-plan-checker.md` | 4.5 | Modify — enhanced Dimension 6, binding constraints |
| `templates/agents/tw-executor.md` | 4.5, 11.1 | Modify — constraint awareness, Discovery Protocol |
| `templates/agents/tw-debugger.md` | 11.1 | Modify — Discovery Protocol |
| `templates/agents/tw-verifier.md` | 4.6, 9.4 | Modify — spec rule compliance, review criteria, profile-aware UAT, manual results |
| `templates/agents/tw-reviewer.md` | P9 | **Create** — code review analyst: semantic review, spec intent, design quality, duplication |
| `templates/agents/tw-entropy-collector.md` | 10.3 | Modify — category 7: Spec Staleness |
| `templates/specs/enforcement/` | 4.1 | **Create** — starter spec templates with example rules |
| `templates/verification-profiles/` | 9.3.5 | **Create** — 7 starter profile templates |
| `tests/unit/rule-evaluator.test.js` | 4.1 | **Create** |
| `tests/unit/quality-gate-compliance.test.js` | 4.3 | **Create** |
| `tests/unit/quality-gate-classify.test.js` | 6.1 | **Create** |
| `tests/unit/quality-gate-smoke.test.js` | 9.1, 9.2 | **Create** |
| `tests/unit/verification-profile.test.js` | 9.3 | **Create** |
| `tests/unit/doc-freshness.test.js` | 10.1 | **Create** |
| `tests/unit/knowledge-notes.test.js` | 11.1-11.7 | **Create** |
| `tests/unit/entropy-trends.test.js` | 12.1 | **Create** |
| `tests/unit/autonomy.test.js` | 13 | **Create** |
| `tests/unit/handoff-gaps.test.js` | 6.3 | **Create** |
| `tests/unit/spec-engine-gaps.test.js` | 8.1, 8.2 | **Create** |
| `tests/unit/state-gaps.test.js` | 8.3 | **Create** |
| `tests/integration/spec-enforcement.test.js` | 4.3, 6.1-6.3 | **Create** — end-to-end enforcement + classification flow |
| `tests/integration/gap-detection.test.js` | 8.1-8.3 | **Create** — proactive audit + pre-execution scan + aggregation |
| `tests/integration/runtime-verification.test.js` | 9.1-9.6 | **Create** — profile detection, gate execution, manual feedback |
| `tests/integration/doc-freshness.test.js` | 10.1-10.3 | **Create** — code change → staleness tracked → gate catches |
| `tests/integration/knowledge-capture.test.js` | 11.1-11.8 | **Create** — discovery → capture → inject → promote |
| `tests/integration/autonomous-flow.test.js` | 13 | **Create** — full autonomous phase without human interaction |
| `tests/unit/reviewer-integration.test.js` | P9 | **Create** — review triggering, iteration limits, feedback formatting |
| `tests/integration/agent-review.test.js` | P9 | **Create** — execute → review → feedback → revise → gates |

**Totals**: 25 new files created, 26 existing files modified, 18 new test files.
