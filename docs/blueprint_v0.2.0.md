# Threadwork v0.2.0 — Update Blueprint
**Upgrading from v0.1.x → v0.2.0**

> **Version**: 0.2.0
> **Status**: Upgrade spec — applies to existing Threadwork projects
> **Prerequisite**: Threadwork v0.1.x already initialized (`threadwork init` completed, `.threadwork/` directory exists)
> **Upgrade command**: `threadwork update --to v0.2.0`

---

## Why This Update Exists: The Research Foundation

This upgrade is directly informed by two landmark articles on production agent system design, both published independently but converging on the same conclusion: **the bottleneck in AI-assisted development is never the model's capability — it is the quality of the environment surrounding it.**

### Source 1: LangChain — "Frameworks, Runtimes, and Harnesses"
`https://docs.langchain.com/oss/python/concepts/products`

LangChain's documentation formally establishes a three-tier taxonomy for agent systems:

- **Agent Frameworks** (LangChain itself) — abstractions, agent loops, tool calling
- **Agent Runtimes** (LangGraph) — durable execution, streaming, persistence, human-in-the-loop
- **Agent Harnesses** (Deep Agents SDK) — batteries-included systems with planning, subagent spawning, filesystem context management, and built-in tools

Under this taxonomy, **Threadwork is an Agent Harness** — already positioned at the highest tier. The article's most actionable contribution is its treatment of **middleware** (lifecycle hooks that intercept and modify agent behavior), **context engineering** (a three-source, three-type matrix distinguishing transient from persistent context), and **dynamic tool selection** (filtering available tools per-agent based on role and state).

The critical concept for Threadwork: LangChain distinguishes between **transient context** (modifying what the LLM sees for one call without changing state) and **persistent context** (modifications that survive across turns and sessions). Threadwork v0.1.x conflates these — the session-start hook injects everything into one block without separating prompt-scoped injection from durable state. This limits the precision of context engineering.

### Source 2: OpenAI — "Harness Engineering: Leveraging Codex in an Agent-First World"
`https://openai.com/index/harness-engineering/`

Ryan Lopopolo documents OpenAI's internal experiment building a product with zero hand-written code using Codex + GPT-5. Over five months, 3–7 engineers produced approximately 1 million lines of code across ~1,500 PRs at 3.5 PRs per engineer per day — roughly 10× faster than manual development.

The article introduces **harness engineering** as a formal discipline: designing the environment, constraints, feedback loops, and control systems that keep agents productive at scale. Martin Fowler's analysis of the same codebase categorizes the harness into three domains:
1. **Context engineering** — knowledge base and dynamic context access
2. **Architectural constraints** — enforced by LLM agents plus deterministic linters
3. **Garbage collection** — background agents that periodically scan for drift and open refactoring PRs

Three patterns from this article have direct, high-impact application to Threadwork:

**Pattern A — Remediation-injecting linter errors.** OpenAI's custom linters don't just flag violations — their error messages are deliberately written to inject fix instructions into the agent's context. The tooling teaches the agent while it works. Every Ralph Loop rejection in Threadwork v0.1.x returns a pass/fail signal; v0.2.0 makes every rejection a structured teaching event.

**Pattern B — Progressive disclosure over monolithic instructions.** OpenAI found that monolithic `AGENTS.md` files failed at scale and migrated to a ~100-line routing document pointing to deeper specs on demand. Threadwork v0.1.x's spec injection front-loads all relevant specs into the subagent context at spawn time. v0.2.0 injects a compact routing map first, with full specs fetchable on demand.

**Pattern C — Background entropy collection.** Without automation, the team spent ~20% of engineering time manually cleaning up "AI slop" — individually-passing outputs that degraded when combined. They automated this into background agents that scan for drift and open small, auto-merging refactoring PRs. Threadwork has no equivalent; v0.2.0 adds a 9th specialist for this.

### What This Means for Threadwork

Both articles independently confirm that Threadwork's hook-first architecture is the right foundation. The gaps they expose are not in the architecture but in the **quality of the loops within it**: rejections that don't teach, context that's injected in bulk rather than on demand, and no mechanism to fight the cumulative entropy that emerges from AI-generated code accumulating across waves. v0.2.0 closes all three gaps.

---

## What Changes in v0.2.0

v0.2.0 introduces **5 targeted upgrades** to existing Threadwork projects. Each upgrade is independent — they can be applied individually if needed. All changes are additive or in-place modifications; no existing state files, spec libraries, journals, or handoffs are altered.

---

### Upgrade 1: Remediation-Injecting Ralph Loop
**Component**: `hooks/subagent-stop.js`, `lib/quality-gate.js`
**Source**: OpenAI harness engineering article, Pattern A
**v0.1.x behavior**: Ralph Loop returns pass/fail. On failure, re-invokes agent with a generic "fix the errors" correction prompt.
**v0.2.0 behavior**: Every rejection includes a structured `remediation` block that is injected directly into the agent's next context window.

#### New rejection payload format

```json
{
  "status": "rejected",
  "iteration": 2,
  "gates": {
    "typecheck": { "passed": false, "errors": ["src/auth.ts:42 - Property 'token' does not exist on type 'User'"] },
    "lint": { "passed": true },
    "tests": { "passed": false, "failures": ["AuthService > should refresh token > expected 200, got 401"] }
  },
  "remediation": {
    "primary_violation": "TypeScript type error in auth module",
    "relevant_spec": "backend/auth-patterns — Section: User type definition",
    "fix_template": "The User type exported from src/types/user.ts does not include a 'token' field. Either add 'token?: string' to the User type, or access the token via the AuthSession type instead. Check the existing pattern in src/services/session.ts line 18.",
    "learning_signal": "Type mismatch between User and AuthSession — update spec proposal queued"
  }
}
```

#### Changes to `lib/quality-gate.js`

Add `buildRemediationBlock(gateResults, specEngine)`:
- Receives raw gate output (errors, failures)
- Calls `spec-engine.findRelatedSpec(errorMessage)` — keyword match against spec index
- Returns a `remediation` object with `primary_violation`, `relevant_spec` (spec file path + section), `fix_template` (1–3 sentence concrete instruction), and `learning_signal` (description of the pattern that failed, queued as spec proposal)

#### Changes to `hooks/subagent-stop.js`

Replace the generic correction prompt with the structured remediation block:

```javascript
// v0.1.x — generic
const correctionPrompt = `Fix these errors: ${errors.join(', ')}`;

// v0.2.0 — remediation-injecting
const correctionPrompt = buildRemediationPrompt(rejectionPayload);
// Produces: "TypeScript type error in auth module.
// Relevant spec: backend/auth-patterns § User type definition
// Fix: The User type from src/types/user.ts lacks a 'token' field.
// Add 'token?: string' or use AuthSession instead — see src/services/session.ts:18."
```

The learning signal is written to `.threadwork/specs/proposals/` at rejection time with confidence 0.3. If the same pattern fails across 3 or more retry cycles, confidence is automatically promoted to 0.6 and the developer is notified at next `/tw:specs proposals`.

#### Skill-tier formatting for rejection messages
- **Beginner**: Full remediation block + explanation of why the error matters
- **Advanced**: Remediation block without background explanation
- **Ninja**: Error line, relevant spec name, one-sentence fix only

---

### Upgrade 2: Progressive Disclosure Spec Injection
**Components**: `lib/spec-engine.js`, `hooks/session-start.js`, `hooks/pre-tool-use.js`, `lib/token-tracker.js`
**Source**: OpenAI harness engineering article (Pattern B) + LangChain transient/persistent context distinction
**v0.1.x behavior**: On subagent spawn, `pre-tool-use.js` selects relevant specs and front-loads the full text of each into the agent's prompt. Token cost is paid upfront regardless of whether the agent uses all injected specs.
**v0.2.0 behavior**: Two-tier injection model. Tier 1 (always injected, ~100 tokens): a compact routing map. Tier 2 (on-demand, agent-initiated): full spec text fetched via a `spec-fetch` tool call.

#### New spec routing map format

The routing map replaces the full-spec injection block. It is generated by `spec-engine.buildRoutingMap(taskDescription, phase)` and looks like:

```
── SPEC ROUTING MAP ─────────────────────────────────
Task context: Implement JWT refresh token rotation
Relevant spec domains: backend/auth-patterns, testing/testing-standards

Available specs (fetch by ID when needed):
  [SPEC:auth-001]  backend/auth-patterns        — JWT signing, token types, refresh flow
  [SPEC:auth-002]  backend/session-management   — Session store patterns, cookie config
  [SPEC:test-001]  testing/testing-standards    — Unit test structure, mock patterns
  [SPEC:test-002]  testing/auth-test-helpers    — Auth-specific test utilities

To fetch full spec: call spec_fetch tool with spec ID.
Architectural constraint: auth layer must not import from UI layer.
─────────────────────────────────────────────────────
```

#### New `spec_fetch` tool (registered in agent prompts)

Add a lightweight tool definition to all agent prompts via the pre-tool-use hook:

```javascript
// Tool definition injected into every agent's available tools
{
  name: "spec_fetch",
  description: "Fetch the full text of a spec by ID. Use when you need detailed guidance on a specific standard. IDs are shown in the spec routing map.",
  input_schema: {
    type: "object",
    properties: {
      spec_id: { type: "string", description: "e.g. SPEC:auth-001" }
    },
    required: ["spec_id"]
  }
}
```

When an agent calls `spec_fetch`, the pre-tool-use hook intercepts the call, reads the spec file, and returns its content. Token usage for this fetch is recorded in `token-tracker.js` under a new `spec_fetch_tokens` field — so the token dashboard shows spec overhead separately from task execution tokens.

#### Changes to `lib/spec-engine.js`

New functions:
- `buildRoutingMap(taskDescription, phase)`: Selects relevant specs by keyword + phase heuristics, returns the compact routing map string (target: under 150 tokens)
- `fetchSpecById(specId)`: Reads and returns full spec content by ID
- `getRoutingMapTokens(routingMap)`: Estimates token cost of the routing map

Modified functions:
- `buildInjectionBlock()` → deprecated in favour of `buildRoutingMap()` (kept for backward compatibility, marked `@deprecated`)
- `getRelevantSpecs()` → still used internally by `buildRoutingMap()` for spec selection

#### Token impact

The routing map approach reduces initial spec injection from ~3,000–8,000 tokens (v0.1.x, full spec text) to ~100–150 tokens per agent spawn. Agents that need full specs will fetch 1–3 of them on demand, typically 500–2,000 tokens total. Net saving: ~1,500–6,000 tokens per subagent spawn. For a 14-task phase with 14 agent spawns, this recovers approximately 20,000–80,000 tokens of budget.

The token dashboard gains a new line:
```
Spec fetch tokens this session:  4,200  (6 fetches across 4 agents)
```

---

### Upgrade 3: Background Entropy Collector (9th Specialist Agent)
**Components**: New agent `tw-entropy-collector.md`, `hooks/post-tool-use.js` (wave completion trigger), `lib/quality-gate.js` (entropy scan runner)
**Source**: OpenAI harness engineering article, Pattern C — "garbage collection" background agents
**v0.1.x behavior**: Ralph Loop gates individual task output. No process exists to detect quality degradation emerging from the *interaction* of individually-passing outputs accumulated across waves.
**v0.2.0 behavior**: After each wave completes, a low-priority background agent scans the wave's diff against taste invariants, identifies cross-output inconsistencies, and either auto-fixes minor issues or queues them as pre-conditions for the next wave.

#### `tw-entropy-collector` agent profile

| Field | Value |
|---|---|
| **Persona** | Codebase Integrity Analyst |
| **Context size** | Medium (targeted diff, not full codebase) |
| **Model profile** | Budget (Haiku) — low-priority background task |
| **Trigger** | Post-wave completion (not per-task) |
| **Input** | Git diff of all changes in the completed wave + taste invariants from spec library |
| **Output** | `entropy-report-wave-N.json` + optional auto-fix commits + spec proposals |

#### What the entropy collector scans for

Drawn directly from OpenAI's garbage collection patterns, the collector checks for:

1. **Naming drift** — functions, variables, and files introduced in this wave that don't follow established naming conventions in the spec library
2. **Import boundary violations** — imports that cross the project's architectural layer boundaries (if defined in specs)
3. **Orphaned artifacts** — files created in this wave that are never imported or referenced
4. **Documentation staleness** — functions/modules modified in this wave whose docstrings no longer match the implementation
5. **Inconsistent error handling** — error handling patterns in this wave that diverge from patterns established in prior waves
6. **Duplicate logic** — functions in this wave that closely duplicate functions already in the codebase (>80% similarity heuristic)

#### Entropy report format

Written to `.threadwork/state/phases/phase-N/entropy-report-wave-N.json`:

```json
{
  "wave": 2,
  "phase": 1,
  "timestamp": "2025-02-15T14:32:00Z",
  "scanned_files": 8,
  "issues": [
    {
      "type": "naming_drift",
      "severity": "minor",
      "file": "src/services/userAuth.ts",
      "description": "Function 'getUserToken' diverges from project convention 'fetchUserToken' (see backend/naming-conventions spec)",
      "auto_fix": true,
      "fix_applied": false,
      "spec_reference": "SPEC:naming-001"
    },
    {
      "type": "orphaned_artifact",
      "severity": "warning",
      "file": "src/utils/tempDebugHelper.ts",
      "description": "File not imported anywhere. Likely debug artifact from wave execution.",
      "auto_fix": true,
      "fix_applied": true,
      "commit": "chore: remove orphaned debug utility [entropy-collector]"
    }
  ],
  "auto_fixed": 1,
  "queued_for_next_wave": 1,
  "spec_proposals_generated": 0
}
```

#### Trigger mechanism in `hooks/post-tool-use.js`

Add wave-completion detection:

```javascript
// In post-tool-use.js — after recording tool completion
if (isWaveComplete(toolResult)) {
  // Spawn entropy collector as low-priority background agent
  await spawnEntropyCollector({
    waveDiff: getWaveDiff(waveId),
    tasteInvariants: specEngine.loadTasteInvariants(),
    waveId,
    phaseId
  });
}
```

`isWaveComplete()` checks `execution-log.json` — fires when all tasks in the current wave have status `DONE` or `SKIPPED`.

#### Auto-fix behaviour

Minor issues (naming drift, orphaned artifacts, missing docstrings) are auto-fixed and committed with the message format `chore: [entropy-collector] <description>`. These commits appear in the git log but are visually distinct from task commits.

Issues classified as `warning` or above are written to the next wave's pre-conditions in `deps.json`, not auto-fixed — the executor agent receives them in its task context.

#### `/tw:entropy` command (new)

```
/tw:entropy             — Show latest entropy report for current phase
/tw:entropy history     — List all entropy reports across all waves
/tw:entropy show <N>    — Show entropy report for a specific wave
```

---

### Upgrade 4: Cross-Session Memory Store
**Components**: New `lib/store.js`, modified `lib/handoff.js`, modified `hooks/session-start.js`, modified `hooks/post-tool-use.js`, new `.threadwork/store/` directory
**Source**: LangChain three-source context model (Runtime Context / State / **Store**)
**v0.1.x behavior**: Session handoffs transfer state between sequential sessions within one project. No persistent knowledge accumulates across projects. Every new project starts cold.
**v0.2.0 behavior**: A Store layer persists learnings that transcend project boundaries — resolved edge cases, high-confidence patterns, and reusable conventions — and seeds each new project session with relevant accumulated knowledge.

#### The three-tier context model applied to Threadwork

| Context source | v0.1.x equivalent | v0.2.0 addition |
|---|---|---|
| **Runtime Context** | `project.json` (static config: name, stack, tier, budget) | Unchanged |
| **State** | Session journals, handoffs, checkpoints (conversation-scoped) | Unchanged |
| **Store** | *(not present)* | `store/` — cross-project, cross-session persistent learnings |

#### New directory: `.threadwork/store/`

```
.threadwork/store/
├── patterns/           # High-confidence reusable code patterns
│   └── YYYY-MM-DD-pattern-name.md
├── edge-cases/         # Resolved edge cases with solutions
│   └── YYYY-MM-DD-edge-case-name.md
├── conventions/        # Project-specific conventions that elevated to cross-project status
│   └── YYYY-MM-DD-convention-name.md
└── store-index.json    # Searchable index with confidence scores and tags
```

#### `lib/store.js` — new module

```javascript
// Core API
readStore(domain?)             // Returns all Store entries, optionally filtered by domain
writeEntry(domain, key, data)  // Creates a new Store entry
updateEntry(key, data)         // Updates an existing entry
promoteToStore(specProposal)   // Promotes a high-confidence spec proposal to the Store
searchStore(query)             // Full-text + tag search across Store entries
getStoreInjectionBlock()       // Returns a compact Store summary for session-start injection
pruneStore(maxEntries = 50)    // Keeps the 50 highest-confidence entries per domain
getEntryConfidence(key)        // Returns 0.0–1.0 confidence score
```

Store entries use the same frontmatter format as specs:

```markdown
---
domain: patterns
key: jwt-refresh-rotation
created: 2025-02-14
confidence: 0.85
tags: [auth, jwt, security]
projects: [my-api, user-service]
source: ralph-loop-finding
---
# JWT Refresh Token Rotation Pattern

When implementing refresh token rotation, always invalidate the old refresh token
on first use (not on expiry). Pattern confirmed across 3 Ralph Loop failure cycles
in project: my-api. See original spec: backend/auth-patterns § refresh-rotation.
```

#### Promotion pipeline: Ralph Loop → Spec Proposal → Store

v0.2.0 closes the feedback loop that v0.1.x leaves open:

```
Ralph Loop rejection
  → generates spec proposal (confidence 0.3) in .threadwork/specs/proposals/
  → developer accepts proposal → confidence 0.7
  → proposal survives 3+ sessions without regression → auto-promoted to Store (confidence 0.85)
  → Store entry injected into future sessions across all projects
```

This is the direct implementation of OpenAI's finding that "every AGENTS.md update prevents a class of future failures." In Threadwork, it's automated: every Ralph Loop finding that survives review and validation eventually becomes part of the permanent knowledge base.

#### Session-start hook changes

The orientation block gains a Store section (compact, ~50 tokens):

```
── STORE (cross-project learnings) ──────────────────
3 high-confidence entries relevant to this session:
  [STORE:jwt-001]  JWT refresh rotation pattern (confidence: 0.85)
  [STORE:auth-002] OAuth state validation edge case (confidence: 0.78)
  [STORE:test-001] Async test timeout pattern (confidence: 0.92)
To fetch full entry: call store_fetch tool with entry ID.
──────────────────────────────────────────────────────
```

Full Store entries are fetched on demand via a new `store_fetch` tool (same pattern as `spec_fetch` from Upgrade 2).

#### `/tw:store` command (new)

```
/tw:store               — Show Store dashboard (entry count, domains, top confidence)
/tw:store list          — List all Store entries with confidence and tags
/tw:store show <key>    — Display a specific Store entry
/tw:store promote <id>  — Manually promote a spec proposal to the Store
/tw:store prune         — Remove low-confidence entries (below 0.4 threshold)
```

---

### Upgrade 5: Execution Plan Decision Logs
**Components**: `lib/state.js` (plan format extension), `templates/agents/tw-executor.md` (updated), `lib/handoff.js` (handoff enrichment)
**Source**: OpenAI harness engineering article — "Execution plans are checked into the repository as first-class artifacts with progress and decision logs"
**v0.1.x behavior**: XML plan files are write-once artifacts. Executors produce SUMMARY.md after completion. Handoffs reference task IDs but not the reasoning behind implementation choices.
**v0.2.0 behavior**: Plans gain a living decision log. Every executor agent appends a `<decisions>` block to its plan file as it works, capturing why key choices were made. Downstream agents and handoffs inherit this rationale.

#### Extended XML plan format

```xml
<plan id="PLAN-1-2" phase="1" milestone="1">
  <title>Implement JWT authentication middleware</title>
  <requirements>REQ-003, REQ-007</requirements>
  <tasks>
    <task id="T-1-2-1">
      <description>Create JWT signing and validation utilities</description>
      <files>src/lib/jwt.ts, src/types/auth.ts</files>
      <verification>tsc --noEmit passes, unit tests pass</verification>
      <done-condition>JWT sign/verify round-trip tested with 3 token types</done-condition>
      <token-estimate>12000</token-estimate>
      <status>DONE</status>
    </task>
  </tasks>
  
  <!-- NEW IN v0.2.0 — appended by executor during execution -->
  <decisions>
    <decision task="T-1-2-1" timestamp="2025-02-15T10:14:00Z">
      <choice>Used RS256 (asymmetric) instead of HS256 (symmetric)</choice>
      <rationale>Project requires token verification by external services that should not hold the signing secret. RS256 allows public-key verification without secret distribution.</rationale>
      <alternatives-considered>HS256 (rejected: secret sharing required), ES256 (rejected: not supported by existing auth proxy)</alternatives-considered>
    </decision>
    <decision task="T-1-2-1" timestamp="2025-02-15T10:22:00Z">
      <choice>Token expiry set to 15 minutes for access tokens, 7 days for refresh tokens</choice>
      <rationale>Follows OWASP recommendation. Matches existing session config in project.json.</rationale>
      <alternatives-considered>1 hour access token (rejected: too long for sensitive financial data context)</alternatives-considered>
    </decision>
  </decisions>
</plan>
```

#### Executor agent changes (`tw-executor.md`)

Add a mandatory decision logging protocol to the executor's behavioral rules:

```markdown
## Decision Logging Protocol (v0.2.0)

For every non-trivial implementation choice made during task execution, append a
<decision> block to the plan XML before committing:

Criteria for a "non-trivial" choice:
- Choosing between two or more valid implementation approaches
- Deviating from the spec's suggested approach with justification
- Resolving an ambiguity in the task description
- Making a security or performance trade-off

Format: <choice> (one sentence), <rationale> (1–3 sentences), <alternatives-considered> (one sentence per rejected option)

Decisions are read by the tw-verifier, tw-debugger, and included in session handoffs.
Do not log trivial choices (e.g., variable names, formatting, obvious implementations).
```

#### Handoff enrichment

The session handoff's **Section 4: Key Decisions Made** (previously a manual or AI-inferred field) is now populated automatically by reading `<decisions>` blocks from all plans touched in the session. This eliminates the gap where important architectural choices would be lost between sessions.

#### `lib/state.js` additions

```javascript
appendDecision(planId, taskId, decisionData)  // Writes a <decision> block to the plan XML
readDecisions(planId)                          // Returns all decisions for a plan
readSessionDecisions(sessionStartSha)          // Returns all decisions made since a git SHA
```

---

## Updated Directory Structure (v0.2.0)

Changes from v0.1.x are marked `← NEW` or `← MODIFIED`.

```
your-project/
├── THREADWORK.md                                  ← MODIFIED (updated hook docs, store docs)
├── .threadwork/
│   ├── state/
│   │   ├── project.json                           ← MODIFIED (_version: "0.2.0")
│   │   ├── checkpoint.json
│   │   ├── active-task.json
│   │   ├── completed-tasks.json
│   │   ├── token-log.json                         ← MODIFIED (adds spec_fetch_tokens field)
│   │   ├── hook-log.json
│   │   ├── ralph-state.json                       ← MODIFIED (adds remediation_log field)
│   │   ├── quality-config.json
│   │   ├── codebase-map.json
│   │   └── phases/
│   │       └── phase-N/
│   │           ├── CONTEXT.md
│   │           ├── deps.json
│   │           ├── execution-log.json
│   │           ├── VERIFICATION.md
│   │           ├── UAT.md
│   │           ├── entropy-report-wave-N.json     ← NEW (one per wave)
│   │           └── plans/
│   │               └── PLAN-N-*.xml               ← MODIFIED (adds <decisions> block)
│   ├── specs/
│   │   ├── index.md                               ← MODIFIED (adds spec IDs for routing map)
│   │   ├── frontend/
│   │   ├── backend/
│   │   ├── testing/
│   │   └── proposals/
│   ├── store/                                     ← NEW
│   │   ├── store-index.json
│   │   ├── patterns/
│   │   ├── edge-cases/
│   │   └── conventions/
│   ├── workspace/
│   │   ├── journals/
│   │   ├── handoffs/                              ← MODIFIED (Section 4 auto-populated)
│   │   └── archive/
│   └── worktrees/
├── .planning/
└── docs/
```

---

## Updated Agent Roster (v0.2.0)

| Agent | Persona | Context Size | Model Profile | Status |
|---|---|---|---|---|
| `tw-planner` | Senior Software Architect | Large (fresh 200K) | Quality (Opus) | Unchanged |
| `tw-researcher` | Domain Research Analyst | Large (fresh 200K) | Quality (Opus) | Unchanged |
| `tw-plan-checker` | Requirements Validation Specialist | Medium | Balanced (Sonnet) | Unchanged |
| `tw-executor` | Senior Developer | Large (fresh 200K) | Balanced (Sonnet) | **Modified** (decision logging protocol) |
| `tw-verifier` | QA Engineer | Medium | Balanced (Sonnet) | Unchanged |
| `tw-debugger` | Debugging Specialist | Large (fresh 200K) | Quality (Opus) | Unchanged |
| `tw-dispatch` | Parallel Work Coordinator | Small | Budget (Haiku) | Unchanged |
| `tw-spec-writer` | Standards Curator | Small | Budget (Haiku) | Unchanged |
| `tw-entropy-collector` | Codebase Integrity Analyst | Medium (diff-scoped) | Budget (Haiku) | **NEW** |

All agents receive three injections from the pre-tool-use hook (updated from v0.1.x's two):
1. **Spec routing map** — compact map + fetchable spec IDs (replaces full spec injection)
2. **Skill tier instruction** — controls output verbosity
3. **Token budget status** — remaining budget awareness (now includes `spec_fetch_tokens` breakdown)

---

## Updated Slash Command Reference (v0.2.0)

New commands added by this upgrade:

| Command | Description | New in |
|---|---|---|
| `/tw:entropy` | Show latest entropy report for current wave/phase | v0.2.0 |
| `/tw:entropy history` | List all entropy reports with dates and issue counts | v0.2.0 |
| `/tw:entropy show <N>` | Display entropy report for a specific wave | v0.2.0 |
| `/tw:store` | Cross-session memory Store dashboard | v0.2.0 |
| `/tw:store list` | List all Store entries with confidence scores | v0.2.0 |
| `/tw:store show <key>` | Display a specific Store entry | v0.2.0 |
| `/tw:store promote <id>` | Manually promote a spec proposal to Store | v0.2.0 |
| `/tw:store prune` | Remove low-confidence Store entries | v0.2.0 |

All v0.1.x commands remain unchanged. Their behaviour is extended where relevant (e.g. `/tw:budget` now shows `spec_fetch_tokens`, `/tw:specs proposals` now shows confidence levels and promotion pipeline status).

---

## Updated Core Design Principles (v0.2.0)

Adds three principles to the original seven:

8. **Self-improving by default**: Every quality gate failure is a learning event. Rejections generate spec proposals; accepted proposals accumulate into the Store; the Store seeds future sessions. The harness gets smarter with every cycle.
9. **Progressive disclosure, not front-loading**: Context is served in two tiers — a compact routing map first, full detail on demand. Agents fetch what they need when they need it, not everything upfront.
10. **Entropy is automatic, not manual**: AI-generated code accumulates inconsistencies. The entropy collector runs after every wave to catch cross-output drift before it becomes technical debt, so the developer never spends time on "AI slop" cleanup.

---

## Migration Guide: v0.1.x → v0.2.0

The upgrade is non-destructive. All existing state, specs, journals, and handoffs are preserved exactly.

### What the `threadwork update --to v0.2.0` command does

1. **Backs up** `hooks/` directory to `.threadwork/backup/v0.1.x-hooks/`
2. **Replaces** `hooks/subagent-stop.js` with the remediation-injecting version
3. **Replaces** `hooks/pre-tool-use.js` with the progressive disclosure version
4. **Replaces** `hooks/post-tool-use.js` with the wave-completion entropy trigger version
5. **Replaces** `hooks/session-start.js` with the Store-aware version
6. **Adds** `lib/store.js` — new Store module
7. **Updates** `lib/spec-engine.js` — adds `buildRoutingMap()`, `fetchSpecById()`, marks `buildInjectionBlock()` as deprecated
8. **Updates** `lib/quality-gate.js` — adds `buildRemediationBlock()`
9. **Updates** `lib/state.js` — adds `appendDecision()`, `readDecisions()`, `readSessionDecisions()`
10. **Updates** `lib/handoff.js` — auto-populates Section 4 from plan decisions
11. **Installs** agent `templates/agents/tw-entropy-collector.md`
12. **Updates** agent `templates/agents/tw-executor.md` with decision logging protocol
13. **Creates** `.threadwork/store/` directory structure and empty `store-index.json`
14. **Updates** `.threadwork/state/project.json` — sets `_version: "0.2.0"`, adds `store_enabled: true`
15. **Adds** `spec_fetch_tokens` field to existing `token-log.json`
16. **Adds** `remediation_log: []` field to existing `ralph-state.json`
17. **Updates** `THREADWORK.md` with new commands, new design principles, and Store documentation
18. **Prints** a summary of all changes made

### What is NOT changed

- All spec files in `.threadwork/specs/` — user-authored content is never touched
- All journals and handoffs — historical session memory is preserved
- All plan files — existing `.xml` plans do not gain `<decisions>` blocks retroactively (only new plans do)
- `project.json` fields other than `_version` and `store_enabled`
- `settings.json` hook registrations — the hook file paths don't change, only the scripts themselves

### Manual steps required after upgrade

1. **Add spec IDs to `specs/index.md`**: The routing map relies on spec IDs (e.g., `[SPEC:auth-001]`). Run `/tw:specs reindex` to auto-generate IDs for all existing specs. This takes under 30 seconds.
2. **Review quality-config.json**: The entropy collector's scan categories can be configured in `quality-config.json`. Review the defaults and disable any categories that don't apply to your project.
3. **Confirm Store domain settings**: In `project.json`, set `store_domains` to the domains you want the Store to track (default: `["patterns", "edge-cases", "conventions"]`).

---

## Key Design Decisions: What v0.2.0 Chose and Why

### Why remediation in the rejection payload, not a separate correction call?

Injecting the remediation block directly into the agent's next context window means the fix instruction is present *when the agent starts re-executing*, not after it has already begun attempting a fix. This matches how OpenAI's custom linters work: the error message *is* the instruction, delivered at exactly the moment it's needed.

### Why two-tier spec injection over full injection?

The 8,000-token injection cap in v0.1.x was a blunt instrument — it caused arbitrary truncation when multiple large specs were relevant. The routing map eliminates truncation entirely. Agents explicitly pull what they need, and the token cost is visible and trackable. The cap is replaced by a pull model where agents are in control.

### Why a 9th agent instead of extending the Ralph Loop?

The Ralph Loop operates per-task (blocking individual agent completion). Entropy collection operates per-wave (scanning accumulated cross-task output). These are different temporal scopes requiring different triggers. A separate agent with its own prompt keeps the Ralph Loop's scope clean and gives the entropy collector a dedicated, appropriately-scoped context window.

### Why store in `.threadwork/store/` rather than extending specs?

Specs are project-scoped conventions (what this project does). The Store is cross-project accumulated wisdom (patterns that have been proven across multiple projects or multiple failure cycles). Keeping them in separate directories makes the scope of each unambiguous and prevents the spec library from becoming polluted with knowledge that belongs to a different level of abstraction.

### Why append decisions to the plan XML rather than a separate file?

Co-locating decisions with the plan keeps the rationale inseparable from the task it describes. When a verifier, debugger, or future session loads a plan, they get the decisions automatically. No separate file lookup. No possibility of the decision file and the plan falling out of sync.
