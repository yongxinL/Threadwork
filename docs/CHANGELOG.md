# Changelog

All notable changes to **threadwork-cc** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.1] — 2026-03-02

### Added

#### Team Worker Health Monitoring
- **STARTED signal** — workers send `STARTED planId=<P> worker=<name>` as their very first action before touching any file; the orchestrator now has proof-of-life from the first API call instead of waiting blindly
- **Per-task HEARTBEAT** — workers send `HEARTBEAT planId=<P> taskId=<T> completed=<N>/<total>` immediately after every atomic commit; the orchestrator receives continuous progress signals throughout execution
- **`workerLastSeen` tracking** — `team-session.json` now stores a per-worker ISO timestamp updated on every received message (`STARTED`, `HEARTBEAT`, `DONE`, `BLOCKED`, `BUDGET_LOW`); stale workers are detectable at any point
- **`workerTasks` map** — `team-session.json` stores the Claude Code task ID for each worker, enabling cross-referencing between team messages and the task list

#### Orchestrator Timeout Detection (Step 3T.3b / 3T.3c / 3T.4)
- **Step 3T.3b — TaskCreate registration** — immediately after spawning workers the orchestrator calls `TaskCreate` for each plan, making every running plan visible as a named task in the Claude Code UI
- **Step 3T.3c — Startup verification** — orchestrator waits up to 3 minutes for each worker to send `STARTED`; workers absent from `~/.claude/teams/<name>/config.json` are flagged as failed-to-join; if more than half the wave workers do not confirm, the orchestrator falls back to LEGACY mode automatically
- **15-minute stale detection** — every time a message is processed the orchestrator scans `workerLastSeen` for workers silent >15 min; stale workers receive a `PING` via `SendMessage`
- **20-minute hard timeout** — workers still silent 5 minutes after a PING are marked `FAILED` with reason `worker_timeout` and their team task is updated accordingly; execution continues with the remaining workers

#### TaskList / TaskUpdate Integration
- `tw-executor` now has `TaskList` and `TaskUpdate` in `allowed-tools`; workers look up their assigned team task at startup and keep it updated throughout execution
- `tw-execute-phase` has `TaskCreate`, `TaskList`, and `TaskUpdate` in `allowed-tools`; orchestrator creates, monitors, and closes tasks at the wave level
- `tw:status` has `TaskList` in `allowed-tools`; calls `TaskList` live when a team session is active

#### `/tw:status` Worker Health Table
- When a team session is active, `/tw:status` now appends a per-worker health table below the main dashboard showing: worker name, Claude Code task status, last-heard timestamp, and plan completion progress
- Staleness badges: no badge (<5 min), `(quiet)` (5–14 min), `⚠️ (silent)` (15+ min), `✗ (timed out)` (20+ min)
- Warning shown when `workerLastSeen` is empty: "No worker heartbeats recorded — workers may not have confirmed startup"

#### New `lib/team-coordinator.js` exports
- `updateWorkerLastSeen(teamSession, workerName)` — returns a shallow copy of the session with `workerLastSeen[workerName]` set to now; pure function, caller writes to disk
- `getStaleWorkers(teamSession, thresholdMs?)` — returns names of workers in non-terminal state whose last contact exceeds the threshold (default 15 min); handles never-heard-from workers using session start time as the reference

### Changed
- `team-session.json` schema extended with `workerTasks: {}` and `workerLastSeen: {}` fields (backward-compatible; both default to empty objects)
- `tw-executor` Team Mode Protocol restructured: startup announcement is now **Step 0** (before plan reading); heartbeat and `TaskUpdate` calls are integrated into the per-task loop

---

## [0.1.0] — 2026-03-01

### Added

#### Core CLI (`bin/threadwork.js`)
- `threadwork init` — interactive 6-question project setup (name, stack, quality preset, teamMode, skill tier, token budget); writes `.threadwork/state/project.json`
- `threadwork update` — updates framework files (hooks, commands, agents) while preserving user spec library
- `threadwork status` — prints project status to stdout (phase, tier, budget, teamMode)

#### Core Library (`lib/`)

**`lib/runtime.js`**
- `detectRuntime()` — detects Claude Code vs Codex environment
- `getCommandsDir()` / `getAgentsDir()` — returns the correct `.claude/commands/` or `.claude/agents/` path for the detected runtime
- `getHooksConfig()` — reads the `hooks` block from `settings.json`
- `getSettingsPath()` — returns the settings.json path for the active runtime
- `isHookSupported(hookName)` — checks whether the runtime supports a given hook event

**`lib/state.js`**
- `readState()` / `writeState()` — reads and writes `.threadwork/state/project.json` with `_version` + `_updated` metadata on every write
- `setPhase()`, `setMilestone()`, `setActiveTask()`, `clearActiveTask()` — atomic phase/task state updates
- `getGitInfo()` — returns current branch and last commit SHA
- `readCheckpoint()` / `writeCheckpoint()` / `clearCheckpoint()` — session recovery checkpoint management
- `listPlans(phase)` — synchronous plan file enumeration using `readdirSync`
- `writeTeamSession()` / `readTeamSession()` / `clearTeamSession()` — team session state for Claude Code Team model coordination

**`lib/token-tracker.js`**
- `estimateTokens(text)` — character / 4 estimation
- `estimateTaskBudget(plan)` — sums `<token-estimate>` values from a plan XML
- `trackUsage(tokens)` — accumulates session usage against the budget
- `getBudgetReport()` — returns `{ used, remaining, pct, status }` (status: healthy / warning / critical)
- `formatBudgetDashboard()` — formatted string for hook injection
- `resetSessionUsage()` — clears the session counter for a new session
- 80% warning and 90% critical thresholds

**`lib/skill-tier.js`**
- `getTier()` / `setTier(tier)` — reads and writes the tier setting to `project.json`
- `getTierInstructions(tier)` — returns the `## Output Style` block for injection (beginner / advanced / ninja)
- `formatOutput(content, tier)` — applies tier-appropriate verbosity formatting
- `getWarningStyle(level, message, tier)` — formats warnings with tier-appropriate style

**`lib/git.js`**
- `getCurrentBranch()` — returns the current git branch name
- `getLastCommitSha()` — returns the HEAD commit SHA
- `getUncommittedFiles()` — lists files with uncommitted changes
- `writeAtomicCommit(message)` — stages all changes and creates a commit
- `createWorktree(branch, path)` — creates an isolated git worktree
- `removeWorktree(path)` — removes a worktree and its branch
- `getFilesChangedSince(sha)` — lists files changed since a given commit

**`lib/journal.js`**
- `writeJournal(content)` — writes a timestamped journal entry to `.threadwork/workspace/journals/`
- `readLatestJournal()` — returns the most recent journal entry
- `searchJournals(query)` — full-text search across the 30-day rolling window of journal files

**`lib/handoff.js`**
- `generateHandoff(session)` — produces a 10-section structured handoff document (context, work done, decisions, blockers, next steps, token usage, quality gate status, spec proposals, git state, resume prompt)
- `formatResumePrompt(handoff)` — extracts the machine-readable resume prompt from a handoff
- `readLatestHandoff()` — returns the most recent handoff file
- `listHandoffs()` — lists all handoffs sorted by date

**`lib/spec-engine.js`**
- `getRelevantSpecs(context)` — scores and ranks spec files by relevance to the current task context using gray-matter frontmatter tags
- `buildInjectionBlock(specs)` — assembles the `## Loaded Specs` injection block with an 8K token limit
- `proposeSpecUpdate(specPath, suggestion)` — writes a `.proposal.md` alongside the spec for human review
- `acceptProposal(proposalPath)` — applies a pending spec proposal

**`lib/quality-gate.js`**
- `runAll(options)` — runs all configured gates and returns `{ passed, results[] }`
- `runTypecheck()` — runs `tsc --noEmit` and parses errors
- `runLint()` — auto-detects eslint / biome / oxlint and runs the appropriate linter
- `runTests()` — runs the project test suite and parses pass/fail counts
- `runBuild()` — runs the project build script
- `runSecurityScan()` — runs `npm audit` and flags high/critical vulnerabilities
- SHA-based gate caching at `.threadwork/state/.gate-cache.json` — skips gates when no files have changed since last run

**`lib/team-coordinator.js`**
- `shouldUseTeamMode(opts)` — Option D decision function: evaluates `--team`/`--no-team` flags, project `teamMode` setting (`legacy` / `auto` / `team`), and four auto-mode conditions (planCount ≥ 2, budget ≥ 30%, waveBudgetEst ≤ 50% remaining, tier allows ≥ 2 workers)
- `calcWorkerBudget(remainingBudget, numWorkers)` — allocates 60% of remaining budget across workers, minimum 50K per worker
- `generateTeamName(phase, waveIndex)` — deterministic team name: `tw-phase-<N>-<W>-<ts>`
- `generateParallelTeamName(slug)` — team name for `tw:parallel`: `tw-par-<slug>-<ts>`
- `getWorkerNamesForWave(planIds)` — maps plan IDs to canonical worker names
- `getMaxWorkersForTier(tier)` — tier worker limits (ninja: 5, advanced: 3, beginner: 2)
- `readTeamConfig(teamName)` — reads `~/.claude/teams/<name>/config.json`

#### Hook System (`hooks/`)

**`hooks/session-start.js`**
- Composes the orientation block injected at session open: budget status, tier instructions, checkpoint warning (if recovery is available), and current phase/task context

**`hooks/pre-tool-use.js`**
- Intercepts `Task` and `task` tool calls and injects: relevant spec block (via `spec-engine.js`), tier instructions, and token budget status
- Intercepts `TeamCreate` calls and injects budget + tier context into the team description field

**`hooks/post-tool-use.js`**
- Tracks token usage from completed tool calls via `token-tracker.js`
- Emits learning signals (spec match hits, gate pass/fail patterns)
- Writes async-deferred checkpoints after each tool completion

**`hooks/subagent-stop.js` — The Ralph Loop**
- Fires on `SubagentStop` events; runs all quality gates via `quality-gate.js`
- If gates pass: allows completion and clears Ralph state
- If gates fail: blocks completion and re-invokes the agent with a tier-appropriate correction prompt listing the specific errors
- Retries up to 5 times before escalating to the user with a critical warning
- Skips quality gates for non-code agents (planners, researchers, verifiers, dispatchers, orchestrators)
- Logs team context (teamName, worker name) when a team session is active

**`hooks/test-harness.js`**
- Simulates all hook events for all three tiers and budget levels (healthy / warning / critical) for local development and testing

#### Install System (`install/`)

**`install/init.js`**
- 6-question interactive setup: project name, tech stack, quality preset (strict/standard/relaxed), teamMode (legacy/auto/team), skill tier, token budget
- Writes `.threadwork/state/project.json` and `.threadwork/state/token-log.json`
- `maxWorkers` setting prompt when teamMode is auto or team

**`install/claude-code.js`**
- Idempotent merge of hook definitions into `settings.json` (never overwrites user customisations)
- Copies `templates/commands/` → `.claude/commands/` and `templates/agents/` → `.claude/agents/`

**`install/codex.js`**
- Writes `AGENTS.md` with Threadwork behavioral rules injected above any existing content
- Creates `CONTEXT_RESUME.md` with the standard resume prompt pattern

**`install/update.js`**
- Updates all framework files (hooks, commands, agents, AGENTS.md) to the latest versions
- Preserves user-created spec files in `.threadwork/specs/`

**`install/status.js`**
- Prints a compact project status dashboard to stdout (phase, milestone, tier, budget, teamMode, checkpoint status)

#### Slash Commands (`templates/commands/` — 23 commands)

| Command | Purpose |
|---|---|
| `/tw:status` | Full project dashboard: phase, budget, quality gates, team session, skill tier |
| `/tw:tier` | View or change the skill tier (beginner / advanced / ninja) |
| `/tw:budget` | Token budget dashboard with used / remaining / percentage |
| `/tw:estimate` | Token estimate for a task before starting |
| `/tw:tokens` | Full session token log with per-task breakdown |
| `/tw:variance` | Token variance report: estimated vs actual per task |
| `/tw:done` | End session — generates 10-section handoff + resume prompt |
| `/tw:handoff` | List, show, or resume from past session handoffs |
| `/tw:resume` | Load most recent handoff and announce readiness to continue |
| `/tw:recover` | Restore project context after a session crash or context loss |
| `/tw:recall` | Search journals, handoffs, specs, and project history |
| `/tw:specs` | Manage the spec library (list, show, search, add, edit, review proposals) |
| `/tw:journal` | View or search session journals |
| `/tw:quick` | Fast-path task execution without full phase orchestration |
| `/tw:discuss-phase` | Capture developer decisions and preferences before planning |
| `/tw:plan-phase` | Generate detailed XML execution plans for a phase |
| `/tw:execute-phase` | Execute all plans using parallel wave execution with quality gates |
| `/tw:verify-phase` | Goal-backward verification that phase output meets requirements |
| `/tw:parallel` | Run a task in an isolated git worktree with automatic PR creation |
| `/tw:new-project` | Initialize a new project with discovery questions → PROJECT.md, REQUIREMENTS.md, ROADMAP.md |
| `/tw:analyze-codebase` | Map a brownfield codebase (framework detection, architecture summary, starter spec library) |
| `/tw:audit-milestone` | Review all completed phases in a milestone against requirements |
| `/tw:clear` | Clear context between phases (write handoff, clear checkpoint, prepare next phase) |

#### Agent Definitions (`templates/agents/` — 8 agents)

| Agent | Role |
|---|---|
| `tw-executor` | Senior Developer — implements XML plan tasks with atomic commits and spec compliance |
| `tw-dispatch` | Parallel Work Coordinator — manages implement / check / finish in an isolated worktree |
| `tw-planner` | Software Architect — generates detailed XML execution plans with token estimates |
| `tw-plan-checker` | Requirements Validator — validates plans across 6 quality dimensions before execution |
| `tw-researcher` | Domain Analyst — maps codebase, detects patterns, prepares context for planning |
| `tw-verifier` | QA Engineer — goal-backward verification that implementation meets requirements |
| `tw-spec-writer` | Standards Curator — writes and updates spec files from detected patterns |
| `tw-debugger` | Debugging Specialist — hypothesis-driven root cause identification |

All agents include: skill tier awareness, token budget awareness, and checkpoint protocol.

#### Spec Templates (`templates/specs/`)
- `frontend/react-patterns.md` — component structure, hooks patterns, state management rules
- `frontend/styling.md` — CSS-in-JS and Tailwind conventions, responsive layout rules
- `backend/api-design.md` — REST endpoint conventions, error response shapes, pagination
- `backend/auth.md` — jose JWT, httpOnly cookies, bcrypt ×12, refresh token rotation
- `testing/testing-standards.md` — unit / integration / e2e coverage rules, test naming
- `index.md` — spec library index and tagging conventions

#### Project Guide (`templates/THREADWORK.md`)
- Full project-level behavioral guide: command table, directory structure, hook system overview, tier and budget system, typical workflow, spec library management

#### Claude Code Team Model Support (Option D)
- Bidirectional multi-agent coordination using `TeamCreate` and `SendMessage`
- `tw:execute-phase` gains `--team`, `--no-team`, `--max-workers` flags
- Step 3L (legacy) and Step 3T (team) wave execution paths
- Workers send `DONE`, `BLOCKED`, and `BUDGET_LOW` messages to the orchestrator
- Orchestrator attempts up to 3 recovery `SendMessage` exchanges on `BLOCKED` before marking plan as FAILED
- `tw:parallel` gains `--team`/`--no-team` flags; `tw-dispatch` acts as mini-team lead in team mode
- `tw:status` displays active team session (team name, wave, worker count, per-worker budget)
- `tw:status set teamMode <legacy|auto|team>` and `set maxWorkers <N|auto>` sub-commands

#### Tests (`tests/`)
- `tests/unit/runtime.test.js` — runtime detection and path resolution
- `tests/unit/skill-tier.test.js` — tier read/write and instruction formatting
- `tests/unit/token-tracker.test.js` — estimation, budget thresholds, dashboard formatting
- `tests/unit/team-coordinator.test.js` — Option D decision logic, budget calculation, stale worker detection
- `tests/integration/handoff.test.js` — verifies all 10 handoff sections are present and correctly formatted
- `tests/integration/hooks.test.js` — all hook events across all tiers and budget levels using `spawnSync` in a temp directory
- `tests/integration/install.test.js` — init / update / settings merge flows
- `tests/integration/token-tracker.test.js` — end-to-end budget tracking across a simulated session

#### `/tw:new-project` Product Discovery Step
- Five open-ended discovery questions asked before any technical prompts: what the product does, who uses it, core features, MVP scope, and known constraints
- REQUIREMENTS.md is derived from real product context instead of being inferred from stack choices alone
- Understanding confirmation step before proceeding to tech questions

---

## [0.0.1] — 2026-02-27

### Added
- Repository scaffold: `.gitignore` with Node.js, macOS, and IDE exclusions
- MIT `LICENSE`
