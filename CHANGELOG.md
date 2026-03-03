# Changelog

All notable changes to Threadwork are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- `lib/spec-engine.js`: `buildInjectionBlock()` — use `buildRoutingMap()` instead. Will be removed in v0.3.0.

### Migration

For existing v0.1.x projects, run:

```bash
threadwork update --to v0.2.0
```

This is non-destructive. User specs, journals, handoffs, and plan files are preserved exactly.
See [docs/upgrade-guide-v0.2.0.md](docs/upgrade-guide-v0.2.0.md) for the full migration guide.

---

## [0.1.1] — 2025-04-12

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

## [0.1.0] — 2025-03-28

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

## [0.0.2] — 2025-02-10

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

## [0.0.1] — 2025-01-15

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
