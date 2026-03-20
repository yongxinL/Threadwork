# Changelog

All notable changes to Threadwork are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.2] — 2026-03-20

**Nine upgrades across three tiers — Spec Enforcement, Knowledge, Design, Verification, and Autonomous Operation:**

### Added

**Tier 1 — Core Enforcement Loop**

**Upgrade 1: Spec Rules Engine + Compliance Gate**
- `lib/rule-evaluator.js`: New module — `evaluateGrepMustExist`, `evaluateGrepMustNotExist`, `evaluateImportBoundary`, `evaluateNamingPattern`, `evaluateFileStructure`, `evaluateRules` — 5 machine-checkable rule types enforced against the working tree; `globToRegex()` helper for correct glob→regex conversion (single-pass, avoids `**→.*` then dot-escape conflict)
- `lib/spec-engine.js`: `loadRulesFromSpecs(specsDir)` — reads all spec frontmatter `rules` arrays; `wasSpecFetchedThisSession(specId)`, `trackSpecStaleness(specId, changedFiles)` — spec staleness tracking
- `lib/quality-gate.js`: New `spec-compliance` gate calls `loadRulesFromSpecs` + `evaluateRules`; results surfaced in Ralph Loop rejection payloads
- Specs gain optional `rules` frontmatter array. Five rule types:
  - `grep_must_exist` — pattern must appear in files matching glob
  - `grep_must_not_exist` — pattern must NOT appear (e.g. no `console.log` in `src/**`)
  - `import_boundary` — files in `from` glob cannot import from `cannot_import` globs
  - `naming_pattern` — exported names in matching files must match regex
  - `file_structure` — required file glob patterns must exist on disk

**Upgrade 2: Failure Classification + Fast-Track Proposals**
- `lib/quality-gate.js`: `classifyFailure(gateResults, specEngine)` — returns structured `{ type, confidence, evidence, recommendation }` where type is one of `code_bug`, `missing_capability`, `knowledge_gap`, `architectural_violation`, `test_failure`
- `hooks/subagent-stop.js`: Classification-aware retry — different retry strategies per failure type; `tw-reviewer` spawn on architectural violations; autonomy-mode retries

**Upgrade 3: tw-reviewer Agent (Agent-to-Agent Review)**
- `templates/agents/tw-reviewer.md`: New agent — Sonnet; performs structured peer review of executor output; checks spec compliance, naming, import boundaries, test coverage, and architectural decisions; outputs structured `REVIEW:` block with PASS/FAIL per criterion

**Tier 2 — Knowledge, Verification, Design Layer**

**Upgrade 4: Doc-Freshness Gate + Knowledge Notes**
- `lib/doc-freshness.js`: New module — `extractFileReferences(docContent)`, `checkDocFreshness(docPath, projectRoot)` — detects stale documentation by finding file references and checking if referenced files have been modified more recently than the doc
- `lib/knowledge-notes.js`: New module — `addNote`, `readNotes`, `getNotesForScope`, `getCriticalNotes`, `incrementSessionsSurvived`, `promoteEligibleNotes`, `buildKnowledgeNotesBlock` — lifecycle for session-to-session knowledge retention; notes are scoped by file glob and categorized (`setup`, `api`, `edge_case`, `testing`, `workflow`); notes with `sessionsSurvived >= 2` are promoted to the spec library
- `lib/quality-gate.js`: New `doc-freshness` gate
- `templates/agents/tw-entropy-collector.md`: Added 7th category — Spec Staleness; checks files modified in wave against `spec-staleness-tracker.json`
- `templates/commands/tw-docs-health.md`: New `/tw:docs-health` command

**Upgrade 5: Enhanced Discuss-Phase (10+2 Questions)**
- `templates/commands/tw-discuss-phase.md`: Extended from 5 to 12 questions (Q6–Q12 added): architectural rules, required patterns, naming conventions, design files + fidelity, verification profile type, autonomy preference, known gaps/unknowns; Step 4 auto-generates `.threadwork/specs/enforcement/phase-N-rules.md` from rule questions and writes `verificationType`/`autonomyLevel` to `project.json`

**Upgrade 6: Runtime Verification (Smoke Test + Profiles)**
- `lib/verification-profile.js`: New module — `loadProfile(projectJson)`, `runProfileChecks(profile, projectRoot)` — runtime verification via structured profiles stored in `project.json.verification`; supports `file_exists`, `json_schema`, `no_forbidden_patterns` automated check types; profiles for `browser-extension`, `web-app`, `cli-tool`, `library`, `custom`
- `lib/quality-gate.js`: New `smoke-test` gate; calls `runProfileChecks` and surfaces results in Ralph Loop
- `templates/commands/tw-verify-manual.md`: New `/tw:verify-manual` command

**Upgrade 9: Design Reference System**
- `lib/design-ref.js`: New module — `loadDesignRefs(specsDir, projectRoot)`, `resolveDesignRefsForFiles(refs, taskFiles)`, `validateDesignRefs(refs, projectRoot)`, `buildDesignInjectionBlock(refs, projectRoot)` — design files (HTML wireframes, PNGs, SVGs) referenced in spec frontmatter as `design_refs`; injected into executor and verifier prompts; fidelity levels: `exact`, `structural`, `reference`
- `lib/spec-engine.js`: Design refs surfaced in routing map entries
- `templates/agents/tw-verifier.md`: Added design fidelity check — reads design files and compares at declared fidelity level; reports in verification table with `DESIGN:` prefix

**Tier 3 — Proactive Detection + Autonomy**

**Upgrade 7: Capability Gap Detection + Readiness Audit**
- `lib/spec-engine.js`: `scanPlanForGaps(planXml, specIndex)` — detects tasks referencing tools/APIs/services not covered by any spec; `auditHarnessReadiness(projectRoot)` — 7-point readiness check (spec coverage, gap report, knowledge notes, doc freshness, enforcement specs, verification profile, autonomy config)
- `lib/state.js`: `appendGapReport(gaps)`, `readGapReport()`, `aggregateGaps()` — persisted gap tracking across sessions
- `templates/commands/tw-readiness.md`: New `/tw:readiness` command

**Upgrade 8: Autonomous Operation Mode**
- `lib/autonomy.js`: New module — `getAutonomyLevel()`, `setAutonomyLevel(level)`, `shouldAutoApprovePlan(level, gateResults)`, `isSafetyRail(action)`, `buildAutonomyBlock()` — three levels (`supervised`, `guided`, `autonomous`); safety rails block destructive/security/force actions regardless of level; autonomous mode auto-approves plans with no blocking issues
- `hooks/session-start.js`: Injects autonomy block; autonomous mode shows auto-resume notice
- `hooks/post-tool-use.js`: Autonomy auto-handoff in autonomous mode
- `templates/commands/tw-autonomy.md`: New `/tw:autonomy` command

### Changed

- `templates/agents/tw-executor.md`: Added `## Discovery Protocol` section — agents call `knowledge_note({category, scope, summary, evidence, critical})` inline during implementation when discovering non-obvious facts
- `templates/agents/tw-debugger.md`: Added `## Discovery Protocol` section — same knowledge_note tool; emphasizes root causes, workarounds, and API misbehaviors
- `lib/handoff.js`: Section 4b (gap report summary) and Section 4c (knowledge notes) added to handoff generation
- `hooks/pre-tool-use.js`: `knowledge_note` virtual tool interception; design ref block injection for executor/verifier; binding constraints injection
- `hooks/post-tool-use.js`: Spec staleness tracking after writes; knowledge note freshness check; autonomy auto-handoff

### Migration Command

```bash
threadwork update --to v0.3.2
```

**14 idempotent steps:** backs up hooks → creates enforcement and frontend spec directories → initializes state files (`knowledge-notes.json`, `gap-report.json`, `spec-staleness-tracker.json`) → updates hooks and lib modules → installs tw-reviewer agent → updates all command templates → copies verification profile templates → patches `project.json` with `autonomyLevel: 'supervised'`, `verificationType: null`, `_version: '0.3.2'`

---

## [0.3.1] — 2026-03-15

**Patch release — bug fixes only:**

- `hooks/subagent-stop.js`: Use `fd 0` instead of `/dev/stdin` for Node v24 compatibility
- `lib/quality-gate.js`: Correct default pricing for Haiku ($0.80/$4.00/M) and Opus ($15/$75/M) models
- `tests/unit/`: Add `after()` cleanup to all test files missing it

---

## [0.3.0] — 2026-03-05

**Five operational gap fixes for real-world v0.2.x deployments:**

### Added

**Upgrade 1: .gitignore Automation at Init**
- `install/claude-code.js`: `writeGitignoreBlock(projectDir)` — idempotent .gitignore block creation; excludes operational state files (checkpoint, ralph-state, token-log, hook-log, model-switch-log, blueprint-migration), includes worktrees/ and backup/
- `install/init.js`: Calls `writeGitignoreBlock()` after scaffolding and also creates `~/.threadwork/pricing.json` if absent

**Upgrade 2: 200K Context Default + 1M Reminder**
- `lib/token-tracker.js`: `getHighContextAgents()` — returns agents that consumed >150K tokens this session (for context advisory)
- `hooks/pre-tool-use.js`: Complexity check before injection; adds `⚠️ CONTEXT ADVISORY` block when 6+ files / architectural keywords / debugger or planner agents, if `default_context` is `"200k"`
- `hooks/session-start.js`: Reads `default_context` from project.json; shows `Context model: Sonnet 200K / 1M` in orientation; shows high-context agent advisory if agents exceeded 150K tokens
- `install/init.js`: New questions for context model (200K vs 1M), cost budget, and model switch policy; calibrates `session_token_budget` to 400K (200K model) or 800K (1M model)

**Upgrade 3: Dual Cost + Context Budget**
- `lib/token-tracker.js`: `loadPricing()`, `calculateCost(tokens, model)` (60/40 input/output split), `getCostBudget()`, `getCostUsed()`, `getCostRemaining()`, `getCostPercent()`, `getDualBudgetReport()` — full cost+token dual-budget report; `recordUsage()` gains `model` parameter (defaults to `'sonnet'` for backward compat); `resetSessionUsage()` clears `sessionCostUsed`
- `templates/pricing.json`: Global pricing file template (haiku: $0.80/$4.00/M, sonnet: $3/$15/M, opus: $15/$75/M) — created at init if absent, never overwritten
- `templates/commands/tw-cost.md`: `/tw:cost` and `/tw:cost history` commands

**Upgrade 4: Model Switch Policy**
- `lib/model-switcher.js`: New module — `getRecommendedModel(desc, fileCount, agentType)`, `requestSwitch(from, to, reason, policy)` (test mode: `THREADWORK_TEST=1` skips stdin), `logSwitch()`, `getSwitchLog()`, `setSwitchPolicy()`, `getAgentDefault()`, `getAgentDefaults()`; switch log at `.threadwork/state/model-switch-log.json` (excluded from git)
- `hooks/pre-tool-use.js`: Calls `getRecommendedModel()` and `requestSwitch()` before agent spawn
- `lib/handoff.js`: Section 6 now includes model switch log summary (reads directly from model-switch-log.json)
- `templates/commands/tw-model.md`: `/tw:model` and `/tw:model policy` commands

**Upgrade 5: Blueprint Delta Analysis**
- `lib/blueprint-diff.js`: New analysis-only module — `loadLatestBlueprint()`, `lockBlueprint(content, note)`, `diffBlueprints(old, new)` (section-level keyword heuristics, <1s), `mapChangesToPhases(changes, state, sincePhase)`, `estimateMigrationCosts(mapped, pricing)`, `formatDiffReport(analysis, sincePhase)`, `listBlueprintVersions()`; blueprint files stored as `.threadwork/state/blueprint-vN.md` (committed)
- `templates/commands/tw-blueprint-diff.md`: `/tw:blueprint-diff` and `/tw:blueprint-diff --since-phase <N>` commands
- `templates/commands/tw-blueprint-lock.md`: `/tw:blueprint-lock` command

**Migration Command**
- `install/update.js`: `threadwork update --to v0.3.0` — 12-step idempotent migration; backs up hooks, appends .gitignore block, creates pricing.json, updates hooks/ and lib/, installs 4 new commands, patches project.json (adds `default_context`, `cost_budget`, `model_switch_policy`, recalibrates 800K→400K if 200K context), creates sessions/ directory, patches token-log.json (`sessionCostUsed`)

### Changed

- `install/init.js`: Adds 3 new init questions (context model, cost budget, switch policy); project.json `_version` is now `"0.3.0"` on fresh init; `session_token_budget` defaults to 400K (200K model) or 800K (1M model)
- `hooks/pre-tool-use.js`: Context injection version bumped to v0.3.0; adds complexity check and model switcher call
- `hooks/session-start.js`: Shows `default_context` in orientation block; shows high-context agent advisory
- `lib/token-tracker.js`: `recordUsage()` backward-compatible model parameter added; `DEFAULT_BUDGET` unchanged at 800K (migration recalibrates for existing projects)

### Removed

- `lib/spec-engine.js`: `buildInjectionBlock()` — deprecated since v0.2.0. Use `buildRoutingMap()`.

---

## [0.2.0] — 2026-03-03

**Five targeted architectural upgrades informed by two landmark articles on production agent system design:**
- LangChain: "Frameworks, Runtimes, and Harnesses" — three-tier taxonomy for agent systems, transient vs persistent context, dynamic tool selection
- OpenAI: "Harness Engineering: Leveraging Codex in an Agent-First World" — remediation-injecting linters, progressive disclosure, background garbage collection

### Added

**Upgrade 1: Remediation-Injecting Ralph Loop**
- `lib/quality-gate.js`: `buildRemediationBlock(gateResults, specEngine, skillTier)` — parses gate failures and returns a structured `{ primary_violation, relevant_spec, fix_template, learning_signal }` object
- `hooks/subagent-stop.js`: Replaced generic correction prompt with structured rejection payload including `remediation` block; rejection now includes `gates` map with per-gate error details; appends to `remediation_log` in ralph-state.json; queues spec proposal with `source: 'ralph-loop'`
- Skill-tier formatting: beginner (full explanation), advanced (spec ref + fix), ninja (one-liner)

**Upgrade 2: Progressive Disclosure Spec Injection**
- `lib/spec-engine.js`: `buildRoutingMap(taskDescription, phase)` — compact routing map string (~100–150 tokens, replaces full spec injection); `fetchSpecById(specId)` — reads full spec by ID; `getRoutingMapTokens(routingMap)` — token estimate; `generateSpecIds()` — assigns `SPEC:<domain>-<NNN>` IDs to all untagged specs; `findRelatedSpec(errorMessage)` — keyword match; `buildInjectionBlock()` marked `@deprecated`
- `lib/token-tracker.js`: `recordSpecFetch(specId, tokens)`, `getSpecFetchTotal()`, `getSpecFetchBreakdown()`; token dashboard now shows `Spec fetches: XK (N fetches)` line; `resetSessionUsage()` resets `spec_fetch_tokens`
- `hooks/pre-tool-use.js`: Intercepts `spec_fetch` and `store_fetch` virtual tool calls; injects routing map instead of full spec block on agent spawn
- `hooks/session-start.js`: Injects compact Store block (skipped if budget >80%); imports `checkThresholds`

**Upgrade 3: Background Entropy Collector (9th Specialist Agent)**
- `lib/entropy-collector.js`: New module — `isWaveComplete()`, `readExecutionLog()`, `getWaveDiff()`, `getWaveChangedFiles()`, `loadTasteInvariants()`, `writeEntropyReport()`, `readEntropyReport()`, `listEntropyReports()`, `getEntropyReportSummary()`
- `templates/agents/tw-entropy-collector.md`: New agent — Codebase Integrity Analyst, Haiku model, wave-scoped diff analysis; scans for naming drift, import boundary violations, orphaned artifacts, documentation staleness, inconsistent error handling, duplicate logic; auto-fixes minor issues with `chore: [entropy-collector]` commits
- `templates/commands/tw-entropy.md`: New commands — `/tw:entropy`, `/tw:entropy history`, `/tw:entropy show <N>`
- `hooks/post-tool-use.js`: Wave-completion detection via `isWaveComplete()`; entropy collector spawn trigger with flag file to prevent duplicate spawns; Store promotion pipeline at Task completion

**Upgrade 4: Cross-Session Memory Store**
- `lib/store.js`: New global Store at `~/.threadwork/store/` (override: `THREADWORK_STORE_DIR` env); `readStore()`, `writeEntry()`, `updateEntry()`, `readEntry()`, `promoteToStore()` (requires confidence ≥0.7), `searchStore()` (tag + key + full-text), `getStoreInjectionBlock()` (<100 tokens), `pruneStore()`, `getEntryConfidence()`
- `templates/commands/tw-store.md`: New commands — `/tw:store`, `/tw:store list`, `/tw:store show <key>`, `/tw:store promote <id>`, `/tw:store prune`
- `lib/handoff.js`: `getStoreStatusForHandoff()` — scans proposals approaching promotion threshold; handoff now shows Store status lines after Section 4

**Upgrade 5: Execution Plan Decision Logs**
- `lib/state.js`: `appendDecision(planId, taskId, decisionData)` — appends `<decision>` XML element to plan file and stages with `git add`; `readDecisions(planId)` — returns empty array for v0.1.x plans (backward compat); `readSessionDecisions(sinceCommitSha)` — finds decisions across all modified plans since a SHA
- `lib/handoff.js`: Handoff Section 4 now auto-populated from `<decisions>` blocks via `readSessionDecisions()`; falls back to manually provided `keyDecisions` array; ultimate fallback to `_No architectural decisions recorded_`
- `templates/agents/tw-executor.md`: Added Decision Logging Protocol — criteria for non-trivial choices, XML format, updated commit protocol (decisions committed with task code)

**Migration Command**
- `bin/threadwork.js`: `update` command gains `--to <version>` option
- `install/update.js`: `threadwork update --to v0.2.0` — 18-step idempotent migration; backs up hooks, updates all framework files, creates `.threadwork/store/`, patches `project.json` (`_version: "0.2.0"`, `store_enabled: true`), patches `token-log.json` (`spec_fetch_tokens`), patches `ralph-state.json` (`remediation_log`), runs `generateSpecIds()`

### Changed

- `hooks/subagent-stop.js`: Rejection payload now structured JSON with `gates` map and `remediation` block; `clearRalphState()` preserves `remediation_log` in `hook-log.json`
- `hooks/pre-tool-use.js`: Spec injection replaced with two-tier routing map model
- `hooks/session-start.js`: Gains Store section injection
- `hooks/post-tool-use.js`: Gains wave-completion detection and Store promotion pipeline
- `lib/handoff.js`: Section 4 sourced from plan XML decisions; Store status section added
- `templates/agents/tw-executor.md`: Decision logging protocol added to executor behavioral rules

### Deprecated

- `lib/spec-engine.js`: `buildInjectionBlock()` — use `buildRoutingMap()` instead. Removed in v0.3.0.

### Migration

For existing v0.1.x projects, run:

```bash
threadwork update --to v0.2.0
```

This is non-destructive. User specs, journals, handoffs, and plan files are preserved exactly.
See [docs/upgrade.md](docs/upgrade.md) for the full migration guide.

---

## [0.1.1] — 2026-02-28

### Added

- Team worker health monitoring — orchestrator tracks worker heartbeats and detects stalls
- `TaskList` visibility for orchestrator — can see per-worker task status without polling
- `BUDGET_LOW` signal from workers when budget drops below 10%
- Worker auto-recovery: orchestrator reassigns tasks from stalled workers
- Health check interval: configurable via `workerHealthCheckMs` (default 30000ms)

### Changed

- `hooks/post-tool-use.js`: Orchestrator now writes team-health.json after each heartbeat
- `templates/agents/tw-orchestrator.md`: Added health monitoring protocol section
- `templates/agents/tw-executor.md`: Added `BUDGET_LOW` signal protocol

---

## [0.1.0] — 2026-02-27

### Added

- Claude Code Team model support (`teamMode: auto | team | legacy`)
- `tw-orchestrator` agent for bidirectional team coordination
- Per-worker token budgets with `STARTED`/`HEARTBEAT`/`DONE`/`BLOCKED` protocol
- Wave-based parallel execution with topological dependency ordering
- `/tw:execute-phase` `--team` / `--no-team` per-invocation override flags
- Auto mode: 4-condition decision logic before using Team model per wave

### Changed

- `hooks/pre-tool-use.js`: Injects `[TEAM: ...]` marker when team mode is active
- `templates/agents/tw-executor.md`: Team mode protocol section added
- `install/init.js`: Question 4 now asks about team mode (legacy/auto/team) and max workers

---

## [0.0.2] — 2026-02-18

### Added

- `/tw:analyze-codebase` — brownfield project mapping, detects framework, generates starter specs
- `/tw:discuss-phase` — capture library/pattern decisions before planning
- `/tw:audit-milestone` — cross-phase milestone verification
- `tw-plan-checker` agent — validates plans across 6 quality dimensions before execution
- `tw-researcher` agent — domain research and library recommendations

### Changed

- `tw-planner` now calls `tw-plan-checker` before finalizing plans
- `hooks/session-start.js`: Injects codebase map summary when `.threadwork/state/codebase-map.json` exists

---

## [0.0.1] — 2026-02-17

### Added

- Initial release
- `threadwork init` — 6-question setup, scaffolds `.threadwork/`, registers 4 hooks
- `threadwork update` — updates framework files, preserves user specs
- `threadwork status` — project state dashboard
- 4 hooks: `session-start.js`, `pre-tool-use.js`, `post-tool-use.js`, `subagent-stop.js`
- Ralph Loop — SubagentStop quality gate with TypeScript, lint, test, build, security gates
- Token budgeting system with per-task estimates and variance tracking
- 10-section session handoffs with self-contained resume prompts
- Skill tier system: `beginner` / `advanced` / `ninja`
- Spec library with frontend, backend, testing domains and proposals workflow
- 7 agents: `tw-planner`, `tw-researcher`, `tw-executor`, `tw-verifier`, `tw-debugger`, `tw-dispatch`, `tw-spec-writer`
- 25+ slash commands
- Claude Code and Codex runtime support
