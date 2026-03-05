# Threadwork Architecture

## Position in the Agent Taxonomy

Under LangChain's three-tier taxonomy (Framework → Runtime → Harness), Threadwork is an **Agent Harness**: a batteries-included system providing planning, subagent orchestration, filesystem context management, and built-in tools. It wraps Claude Code's agent infrastructure and adds deterministic, hook-enforced workflow layers on top.

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Harness                           │
│                     (Threadwork)                            │
│                                                             │
│  Planning  │  Spec Injection  │  Quality Gates  │  Memory  │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                     Agent Runtime                           │
│                     (Claude Code)                           │
│                                                             │
│         Tool calling │ Subagent spawning │ Context          │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                     Agent Framework                         │
│                     (Claude API)                            │
│                                                             │
│              Model │ Streaming │ Tool definitions           │
└─────────────────────────────────────────────────────────────┘
```

---

## Hook Execution Flow (v0.3.0)

Threadwork registers 4 hooks in `~/.claude/settings.json`. Each fires at a specific point in Claude Code's execution cycle.

```
User starts Claude Code session
         │
         ▼
┌─────────────────────────┐
│  session-start.js       │  Fires once per session start
│                         │
│  1. Read project.json   │
│  2. Inject orientation  │
│     block (project,     │
│     phase, budget, tier)│
│  3. Inject spec index   │
│     (compact list of    │
│     available spec IDs) │
│  4. Inject Store block  │
│     (top 3 entries,     │
│     skipped if >80%     │
│     budget used)        │
│  5. Read default_context│
│     from project.json   │
│     (200k/1m)           │
│  6. Inject cost budget  │
│     status              │
│  7. High-context agent  │
│     advisory (if any    │
│     agent > 150K tokens │
│     last session)       │
└─────────────────────────┘
         │
         ▼
User issues a command (e.g. /tw:execute-phase 1)
         │
         ▼  For each Task() call spawning a subagent:
┌─────────────────────────┐
│  pre-tool-use.js        │  Fires before every Tool call
│                         │
│  On Task() calls:       │
│  1. Build routing map   │
│     (~150 tokens) from  │
│     spec index + task   │
│     description         │
│  2. Inject routing map  │
│     + tier instruction  │
│     + [TOKEN: ...] line │
│  3. Complexity check    │
│     (6+ files / arch    │
│     keywords / debugger │
│     or planner agents)  │
│     → CONTEXT ADVISORY  │
│     if default_context  │
│     is "200k"           │
│  4. Model switch check  │
│     getRecommendedModel()│
│     requestSwitch() per │
│     policy setting      │
│                         │
│  On spec_fetch calls:   │
│  1. Read spec by ID     │
│  2. Record token usage  │
│  3. Return spec content │
│     (intercept, no      │
│     network call)       │
│                         │
│  On store_fetch calls:  │
│  1. Read Store entry    │
│  2. Return entry content│
└─────────────────────────┘
         │
         ▼  Subagent executes tasks, commits, exits
┌─────────────────────────┐
│  post-tool-use.js       │  Fires after every Tool call completes
│                         │
│  1. Record token usage  │
│  2. Check budget        │
│     thresholds (80/90%) │
│  3. Write checkpoint    │
│  4. On wave complete:   │
│     spawn entropy       │
│     collector agent     │
│  5. On Task complete:   │
│     check spec proposal │
│     confidence → Store  │
│     promotion pipeline  │
│  6. On PHASE_VERIFIED:  │
│     extract token-      │
│     summary.json        │
│     (committed per-phase│
│     cost + token        │
│     variance summary)   │
└─────────────────────────┘
         │
         ▼  Subagent completes
┌─────────────────────────┐
│  subagent-stop.js       │  Fires when subagent stops
│  (Ralph Loop)           │
│                         │
│  1. Run quality gates:  │
│     tsc --noEmit        │
│     eslint              │
│     test runner         │
│     security scanner    │
│                         │
│  If ALL pass:           │
│  2. Clear ralph-state   │
│  3. Exit 0 (accept)     │
│                         │
│  If ANY fail:           │
│  2. buildRemediationBlock│
│  3. Build rejection     │
│     payload with gates  │
│     map + remediation   │
│  4. Append to           │
│     remediation_log     │
│  5. Queue spec proposal │
│     (confidence 0.3)    │
│  6. Re-invoke agent     │
│     with correction     │
│     prompt              │
└─────────────────────────┘
```

---

## Spec Injection: Before and After

### v0.1.x (monolithic front-loading)

```
Agent spawn
    │
    ▼
pre-tool-use injects ALL relevant spec text
    │    ┌─────────────────────────────────┐
    │    │ === SPEC: backend/auth-patterns │  ~1,500 tokens
    │    │ [full spec content]            │
    │    ├─────────────────────────────────┤
    │    │ === SPEC: testing/standards     │  ~2,000 tokens
    │    │ [full spec content]            │
    │    └─────────────────────────────────┘
    │    Total: ~3,500 tokens upfront, all at once
    ▼
Agent runs
```

### v0.2.0 (progressive disclosure, two-tier)

```
Agent spawn
    │
    ▼
pre-tool-use injects compact routing map
    │    ┌─────────────────────────────────┐
    │    │ ── SPEC ROUTING MAP ─────────── │  ~150 tokens
    │    │   [SPEC:auth-001] auth-patterns │
    │    │   [SPEC:test-001] standards     │
    │    │   To fetch: spec_fetch <id>     │
    │    └─────────────────────────────────┘
    │
    ▼
Agent runs. When it needs a spec:
    │
    ▼
Agent calls spec_fetch(SPEC:auth-001)
    │
    ▼
pre-tool-use intercepts, reads spec file
    │    ┌─────────────────────────────────┐
    │    │ [Full spec content]             │  ~1,500 tokens
    │    │                                 │  on-demand only
    │    └─────────────────────────────────┘
    │
    ▼
Token usage recorded under spec_fetch_tokens
```

Token saving per 14-task phase: ~20,000–80,000 tokens.

---

## Ralph Loop Remediation Cycle (v0.2.0)

```
Subagent completes
        │
        ▼
subagent-stop.js runs quality gates
        │
    ┌───┴────────┐
    │            │
  PASS         FAIL
    │            │
    ▼            ▼
  Accept    buildRemediationBlock()
             │
             ▼
    ┌─────────────────────────────────────────┐
    │  Rejection Payload                       │
    │  {                                        │
    │    status: "rejected",                    │
    │    iteration: 2,                          │
    │    gates: {                               │
    │      typecheck: { passed: false,          │
    │        errors: ["src/auth.ts:42 TS2339"]  │
    │      },                                   │
    │      lint: { passed: true }               │
    │    },                                     │
    │    remediation: {                         │
    │      primary_violation: "Type error",     │
    │      relevant_spec: "SPEC:auth-001",      │
    │      fix_template: "Add token?: string",  │
    │      learning_signal: "User/AuthSession"  │
    │    }                                      │
    │  }                                        │
    └─────────────────────────────────────────┘
             │
             ├──── Append to remediation_log in ralph-state.json
             │
             ├──── Queue spec proposal (confidence 0.3)
             │
             └──── Re-invoke agent with correction prompt
                          │
                      (max 5 iterations)
```

---

## Three-Tier Memory Model (v0.2.0)

Derived from LangChain's three-source context model:

```
┌────────────────────────────────────────────────────────────────────┐
│  TIER 3: STORE  (cross-project, permanent)                         │
│  ~/.threadwork/store/                                              │
│  High-confidence patterns and edge cases proven across projects    │
│  Injected: ~50 tokens per session start (top 3 relevant entries)  │
│  Updated: auto-promoted from Spec Proposals when confidence ≥ 0.7 │
└────────────────────────────────────────────────────────────────────┘
                              ▲
                   promoted at confidence ≥ 0.7
                              │
┌────────────────────────────────────────────────────────────────────┐
│  TIER 2: STATE  (project-scoped, session-persistent)               │
│  .threadwork/ — journals, handoffs, checkpoints                    │
│  Spec Proposals (confidence 0.3 → 0.6 → 0.7)                      │
│  Plan XML with <decisions> blocks                                   │
│  Injected: routing map (~150 tokens) + context at session start    │
│  Updated: after each session, task, and Ralph Loop rejection       │
└────────────────────────────────────────────────────────────────────┘
                              ▲
                   generated at spec proposal time
                              │
┌────────────────────────────────────────────────────────────────────┐
│  TIER 1: RUNTIME CONTEXT  (session-scoped, transient)              │
│  Token budget, skill tier, current task, branch                    │
│  Injected: each agent spawn via pre-tool-use hook                  │
│  Updated: each tool call via post-tool-use hook                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Dual Budget Model (v0.3.0)

Token budget and cost budget are tracked simultaneously and surfaced in the same dashboard.

```
Token Budget   Used: 180K / 400K  (45%)   ✅ Healthy
Cost Budget    Used: $0.87 / $5.00 (17%)  ✅ Healthy
```

**Data flow:**
```
recordUsage(tokens, model)
    │
    ├── Token: accumulated in token-log.json sessionUsed
    │
    └── Cost:  calculateCost(tokens, model)
                    │
                    └── loads ~/.threadwork/pricing.json
                        applies 60/40 input/output split
                        → getCostUsed() → getCostRemaining()
```

`getDualBudgetReport()` powers both `/tw:budget` (dual view) and `/tw:cost` (cost-only view with per-tier breakdown). Pricing is loaded from `~/.threadwork/pricing.json` — user-editable, never overwritten by migrations.

---

## Model Switch Policy (v0.3.0)

```
Task() spawn
    │
    ▼
getRecommendedModel(desc, fileCount, agentType)
    │
    ├── fileCount ≥ 6 OR architectural keywords → Opus
    ├── agentType is planner/researcher/debugger → Opus (default)
    ├── agentType is executor/verifier/checker  → Sonnet (default)
    └── agentType is dispatch/spec-writer/entropy → Haiku (default)
    │
    ▼
Recommended tier differs from agent default?
    │
    ├── No  → proceed, no switch needed
    │
    └── Yes → requestSwitch(from, to, reason, policy)
                    │
                    ├── policy: "auto"    → logSwitch() silently, proceed
                    │
                    ├── policy: "notify"  → show 10-second countdown
                    │                       "Upgrading to Opus. Cancel? (10s)"
                    │                       → proceed if not cancelled
                    │
                    └── policy: "approve" → show explicit y/n prompt
                                            → proceed only if approved
    │
    ▼
logSwitch() → .threadwork/state/model-switch-log.json
    │          (excluded from git)
    ▼
Handoff Section 6: switch log summary included
```

---

## Nine-Agent Roster (v0.3.0)

| Agent | Model | Context | Default Tier | Trigger |
|-------|-------|---------|--------------|---------|
| `tw-planner` | Opus (Quality) | Large (fresh 200K) | Opus | `/tw:plan-phase N` |
| `tw-researcher` | Opus (Quality) | Large (fresh 200K) | Opus | `/tw:discuss-phase N` |
| `tw-plan-checker` | Sonnet (Balanced) | Medium | Sonnet | Auto, after planning |
| `tw-executor` | Sonnet (Balanced) | Large (fresh 200K) | Sonnet | Per-plan, per wave |
| `tw-verifier` | Sonnet (Balanced) | Medium | Sonnet | `/tw:verify-phase N` |
| `tw-debugger` | Opus (Quality) | Large (fresh 200K) | Opus | `/tw:debug` |
| `tw-dispatch` | Haiku (Budget) | Small | Haiku | Wave orchestration |
| `tw-spec-writer` | Haiku (Budget) | Small | Haiku | Pattern detection |
| `tw-entropy-collector` | Haiku (Budget) | Medium (diff-scoped) | Haiku | Post-wave completion |

The model-switcher can upgrade any agent's tier at runtime based on task complexity. The switch is governed by `model_switch_policy` in `project.json`.

All agents receive:
1. **Spec routing map** — compact map + fetchable spec IDs (replaces full spec injection)
2. **Skill tier instruction** — controls output verbosity
3. **Token budget status** — remaining budget with spec_fetch breakdown

---

## Entropy Collector Wave Lifecycle

```
Wave N completes (all tasks DONE/SKIPPED in execution-log.json)
        │
        ▼
post-tool-use.js: isWaveComplete() returns true
        │
        ▼
Write .threadwork/state/phases/phase-N/.entropy-spawn-wave-N (flag file)
        │
        ▼
Spawn tw-entropy-collector with:
  - git diff of wave (wave start SHA → current HEAD)
  - taste invariants from spec files tagged taste_invariant: true
  - waveId, phaseId
        │
        ▼
tw-entropy-collector scans 6 categories:
  1. Naming drift
  2. Import boundary violations
  3. Orphaned artifacts
  4. Documentation staleness
  5. Inconsistent error handling
  6. Duplicate logic
        │
        ├── Minor issues → auto-fix commit: "chore: [entropy-collector] <desc>"
        │
        ├── Warning issues → write to next wave deps.json
        │
        └── Write entropy-report-wave-N.json
```

---

## Spec Promotion Pipeline

```
Ralph Loop rejection
    │
    ▼ learning_signal → spec proposal written with confidence 0.3
    │   .threadwork/specs/proposals/YYYY-MM-DD-pattern-name.md
    │
    ▼ Same pattern fails 3+ times → confidence auto-promoted to 0.6
    │
    ▼ Developer reviews: /tw:specs proposals
    │   Developer accepts → confidence 0.7
    │
    ▼ post-tool-use: Task completion triggers promotion scan
    │   Proposals with confidence ≥ 0.7 → promoteToStore()
    │
    ▼ Store entry created at ~/.threadwork/store/<domain>/
    │   confidence: 0.85, tagged, searchable
    │
    ▼ Future sessions: getStoreInjectionBlock() returns top 3 entries
      injected at session start (~50 tokens)
```

---

## File Organization

```
Threadwork source repository:
├── bin/
│   └── threadwork.js          CLI entry point (init, update --to v0.2.0, status)
├── hooks/                     Hook scripts (copied to .threadwork/hooks/ on init)
│   ├── session-start.js
│   ├── pre-tool-use.js
│   ├── post-tool-use.js
│   └── subagent-stop.js
├── lib/                       Shared modules (copied to .threadwork/lib/ on init)
│   ├── quality-gate.js        Gate runners + buildRemediationBlock()
│   ├── spec-engine.js         buildRoutingMap(), fetchSpecById(), proposeSpecUpdate()
│   ├── state.js               Project state + plan XML + appendDecision()
│   ├── handoff.js             10-section handoff generation
│   ├── token-tracker.js       Budget tracking + spec_fetch_tokens + cost tracking
│   ├── entropy-collector.js   isWaveComplete(), writeEntropyReport()
│   ├── store.js               Cross-session Store CRUD
│   ├── model-switcher.js      Model tier management + switch policy (v0.3.0)
│   ├── blueprint-diff.js      Blueprint delta analysis (v0.3.0)
│   ├── git.js                 Git utilities (branch, SHA, diff)
│   └── runtime.js             Claude Code / Codex detection
├── install/
│   ├── init.js                threadwork init — interactive scaffold (9 questions)
│   └── update.js              threadwork update (+ --to v0.2.0 / --to v0.3.0 migrations)
└── templates/
    ├── agents/                Agent prompts (tw-planner, tw-executor, ..., tw-entropy-collector)
    ├── commands/              30 slash command markdown files  ← was 23
    ├── pricing.json           Global pricing template (v0.3.0)
    ├── specs/                 Starter spec templates
    └── AGENTS.md              Installed as CLAUDE.md (Claude Code) or AGENTS.md (Codex)
```

Installed into user projects:
```
.threadwork/
├── hooks/           ← copied from source hooks/
├── lib/             ← copied from source lib/
├── specs/           ← starter templates + user-authored specs
├── store/           ← new in v0.2.0: cross-session Store
└── state/           ← project.json, plans, checkpoints, token log
```
