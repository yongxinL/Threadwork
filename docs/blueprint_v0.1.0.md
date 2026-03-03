# Threadwork — Combined GSD + Trellis Tool Blueprint

## Naming Convention
Tool name: **Threadwork** (weaving tasks, specs, and sessions into a single thread)
npm package: `threadwork-cc`
Command prefix: `/tw:`
Directory: `.threadwork/`

---

## Core Design Principles

1. **Macro + Micro**: GSD handles project orchestration (planning, phases, execution). Trellis handles knowledge persistence (specs, quality gates, session memory). Threadwork does both.
2. **Hook-first architecture**: All intelligence driven by JS hooks, not passive CLAUDE.md files.
3. **Runtime-agnostic**: Works on Claude Code AND Codex via a runtime detection layer.
4. **Context-aware, not context-heavy**: Inject only what's needed, when it's needed.
5. **Zero compromise on quality**: Automated verification gates block completion until standards pass.
6. **Budget-conscious by default**: Token usage is tracked, estimated, and surfaced at every phase boundary — you always know what you're spending.
7. **Skill-tier adaptive**: Output verbosity and guidance depth adjusts to the developer's declared experience level.

---

## System Architecture Overview

```
threadwork-cc/
├── bin/
│   └── threadwork.js              # CLI entry point (npx threadwork-cc@latest)
├── hooks/
│   ├── session-start.js          # Hook 1: Session initialization + context injection
│   ├── pre-tool-use.js           # Hook 2: Subagent context injection + spec loading
│   ├── post-tool-use.js          # Hook 3: State sync + learning capture + token tracking
│   └── subagent-stop.js          # Hook 4: Quality gate enforcement (Ralph Loop)
├── lib/
│   ├── runtime.js                # Runtime detection (Claude Code vs Codex)
│   ├── state.js                  # State management
│   ├── spec-engine.js            # Spec library management + injection
│   ├── git.js                    # Git operations (commits, branching, worktrees)
│   ├── token-tracker.js          # Token estimation + budget management + variance
│   ├── quality-gate.js           # Lint/typecheck/test runner
│   ├── journal.js                # Session journal read/write
│   ├── handoff.js                # Session end summary + resume prompt generation
│   └── skill-tier.js             # Verbosity + guidance level management
├── templates/
│   ├── commands/                 # Slash command Markdown templates
│   ├── agents/                   # Specialist agent prompt templates
│   └── specs/                    # Starter spec library templates
├── install/
│   ├── claude-code.js            # Claude Code settings.json installer
│   └── codex.js                  # Codex AGENTS.md / instructions installer
└── package.json
```

---

## Part 1: Functions and Function Requirements

### LAYER A — INSTALLATION & SETUP

---

#### A1. `threadwork init`
**CLI command. Runs once per project.**

**Purpose**: Scaffold the complete Threadwork framework into a project directory.

**Requirements**:
- Detect whether the project is new or brownfield (existing codebase)
- Detect runtime environment: Claude Code (`~/.claude/` exists) or Codex (`CODEX_API_KEY` env var or `codex.json` present)
- Create `.threadwork/` directory with subdirectories: `state/`, `specs/`, `workspace/`, `knowledge-base/`
- Generate `.threadwork/state/project.json` with project metadata scaffold
- Copy starter spec library templates to `.threadwork/specs/` (frontend/, backend/, guides/)
- For **Claude Code**: write hooks into `~/.claude/settings.json` (or project `.claude/settings.json`)
- For **Codex**: write equivalent hook logic into `AGENTS.md` instructions and `codex.json` hooks if supported; fallback to AGENTS.md injection patterns
- Install slash commands to the correct runtime commands directory
- Install agent files to the correct runtime agents directory
- Generate project `THREADWORK.md` (the CLAUDE.md equivalent) at project root
- Ask **6 setup questions** (expanded from original to include skill tier and session budget):
  1. Project name
  2. Tech stack (with suggested options based on detected files)
  3. Quality thresholds (test coverage %, lint rules)
  4. Team or solo mode
  5. **Skill tier**: Beginner / Advanced / Ninja (controls output verbosity — see Layer I)
  6. **Session token budget**: Default 800K (80% of Sonnet's 1M context) or custom value
- Print a clear "what was installed" summary

**Inputs**: CWD, optional `--runtime [claude|codex|auto]` flag, optional `--global` flag
**Outputs**: `.threadwork/` scaffold, runtime config files, hooks registered

---

#### A2. `threadwork update`
**CLI command.**

**Purpose**: Update Threadwork framework files without overwriting user-customized specs or state.

**Requirements**:
- Pull latest templates for agents, slash commands, and hook scripts
- Preserve user-modified spec files (diff and warn on conflicts, never auto-overwrite)
- Update `hooks/` scripts in place
- Bump `project.json` framework version field
- Print changelog summary for what changed

---

#### A3. Runtime Detection Module (`lib/runtime.js`)
**Internal library, used by all hooks and CLI commands.**

**Purpose**: Abstract away Claude Code vs Codex differences so all other code is runtime-agnostic.

**Requirements**:
- `detectRuntime()`: Returns `'claude-code'`, `'codex'`, or `'unknown'`
  - Check for `CLAUDE_CODE` env var or `~/.claude/` directory → `claude-code`
  - Check for `CODEX_API_KEY` env var or `.codex/` directory → `codex`
- `getCommandsDir(runtime)`: Returns the correct commands directory path per runtime
- `getAgentsDir(runtime)`: Returns the correct agents directory path per runtime
- `getHooksConfig(runtime)`: Returns the hook registration format for the runtime
- `getSettingsPath(runtime)`: Returns path to the settings file (e.g., `~/.claude/settings.json` vs `codex.json`)
- `isHookSupported(runtime, hookType)`: Returns bool — Codex may not support all hook types that Claude Code does; this guards against registering unsupported hooks

---

### LAYER B — SESSION MANAGEMENT

---

#### B1. Session Start Hook (`hooks/session-start.js`)
**Fires at**: Every conversation start (Claude Code `SessionStart` event; Codex equivalent)

**Purpose**: Restore context, inject project state, load relevant specs, orient the AI before any user input.

**Requirements**:
- Read `project.json` to get project name, current phase, current milestone, active task, and skill tier
- Read the most recent journal file from `.threadwork/workspace/journals/`
- Read the spec library index from `.threadwork/specs/index.md`
- Read any active recovery checkpoint from `.threadwork/state/checkpoint.json`
- Compose an **orientation block** injected into the system prompt containing:
  - Project name, phase, milestone, active task
  - Last session summary (2–3 sentences from most recent journal)
  - Relevant spec domains for the current phase
  - **Token budget status**: tokens used last session, remaining budget for this session, % consumed — shown as a dashboard line e.g. `[TOKEN BUDGET: 312K used / 800K | 61% remaining]`
  - **Budget warning banner** if last session ended below 20% remaining
  - Active skill tier (injected so all responses this session respect verbosity level)
  - Any pending quality gate failures from the last session
- For **Codex**: generate an equivalent `CONTEXT_RESUME.md` file that Codex reads at session start
- Respect a `--minimal` mode that injects only the project name and current task (for budget-critical sessions)
- Log injection to `.threadwork/state/hook-log.json` with timestamp and bytes injected

---

#### B2. Session End / Journal Writer (`lib/journal.js` + Post-Stop logic)
**Fires at**: Session end (SubagentStop or equivalent stop event)

**Purpose**: Write a structured journal entry capturing what happened in this session for cross-session memory.

**Requirements**:
- `writeJournal(sessionData)`: Creates `.threadwork/workspace/journals/YYYY-MM-DD-N.md`
- Journal structure:
  - Date/time
  - Phase and milestone when session started/ended
  - Tasks completed (read from `state/completed-tasks.json`)
  - Tasks in progress (read from `state/active-task.json`)
  - Key decisions made (extracted from conversation if available, or prompted)
  - Files modified (from git diff or tool call log)
  - Token usage (estimated or actual) and variance vs estimates
  - Next recommended action
- `readLatestJournal()`: Returns the most recent journal as a string for injection
- `searchJournals(query)`: Full-text search across all journals (used by `/tw:recall`)
- Keep journals in rolling 30-day window; archive older ones to `.threadwork/workspace/archive/`

---

#### B3. Session End Summary & Handoff (`lib/handoff.js`)
**NEW — Triggered by**: `/tw:done` command or user saying "I'm done for now"

**Purpose**: Generate a structured 10-section session end summary that makes resuming the next session effortless. Produces a human-readable summary AND a paste-able resume prompt.

**Requirements**:
- `generateHandoff(sessionData)`: Reads session state and produces `.threadwork/workspace/handoffs/YYYY-MM-DD-N.md`
- **10-section handoff structure**:
  1. **Session Overview** — date, duration estimate, phase/milestone at start and end
  2. **Completed This Session** — list of task IDs with one-line descriptions, pulled from `completed-tasks.json`
  3. **In Progress** — task currently active with % estimate if possible
  4. **Key Decisions Made** — architectural or design decisions recorded this session
  5. **Files Modified** — full list from git diff since session start commit SHA
  6. **Token Usage** — used / budget / % consumed / variance vs estimates for each task
  7. **Git State** — current branch, last commit SHA, uncommitted files count
  8. **Quality Gate Status** — last Ralph Loop result (pass/fail, which gates ran)
  9. **Recommended Next Action** — single sentence: "Start task T-2-1-3: implement JWT refresh logic"
  10. **Resume Prompt** — a self-contained block the user can paste as their first message in the next session to instantly restore full context. Format:
      ```
      ── THREADWORK RESUME ──────────────────────────────
      Project: [name] | Phase: [N] | Milestone: [M]
      Last session: [date] | Branch: [branch]
      Completed: [T-IDs]
      In progress: [task ID + description]
      Next action: [recommended next action]
      Token budget remaining: [N]K / [total]K
      Skill tier: [tier]
      ─────────────────────────────────────────────────
      Continue from where we left off. Load checkpoint
      and resume task [ID].
      ```
- `readLatestHandoff()`: Returns the most recent handoff for injection at session start
- `listHandoffs()`: Lists all handoffs with dates (used by `/tw:handoff list`)
- Handoff is also written to `.threadwork/state/checkpoint.json` in machine-readable form for hook consumption

---

#### B4. Recovery Checkpoint (`lib/state.js` — checkpoint functions)
**Used by**: Session start hook, `/tw:recover` command

**Purpose**: Maintain a persistent recovery point so any session crash or context loss can be resumed exactly.

**Requirements**:
- `writeCheckpoint(data)`: Writes `.threadwork/state/checkpoint.json` with:
  - Current phase, milestone, task
  - Last completed task ID
  - Git branch and last commit SHA
  - Token usage at checkpoint
  - Files in progress (uncommitted)
  - Timestamp
- `readCheckpoint()`: Reads and parses the checkpoint file
- `clearCheckpoint()`: Resets after a phase completes cleanly
- `checkpointExists()`: Boolean check — used by session-start to decide whether to show recovery banner
- Auto-write checkpoint on every task completion (Post-Tool-Use hook)

---

### LAYER C — PROJECT ORCHESTRATION (GSD Core Functions)

---

#### C1. Project Initialization (`/tw:new-project`)
**Slash command + underlying lib function.**

**Purpose**: Transform a project idea into a structured spec, requirements document, and roadmap. Uses structured clarifying questions to prevent AI hallucination of constraints.

**Requirements**:
- **Phase 1 Clarifying Questions** (NEW — before any generation happens):
  - Present the user with structured multiple-choice questions in this sequence:
    1. **Project type**: Web App / Mobile App / API / CLI Tool / Library / Other
    2. **Primary language/framework**: (auto-suggest based on detected files, or list: React, Next.js, Vue, Express, FastAPI, etc.) / Other
    3. **Database**: PostgreSQL / MySQL / SQLite / MongoDB / None / Other
    4. **Auth approach**: JWT / Session / OAuth / None / Other
    5. **Team size**: Solo / 2–3 people / 4–8 people / Other
    6. **Deployment target**: Vercel / Railway / AWS / Docker / Other
    7. **Key constraints**: (free text — budget, timeline, existing integrations, etc.)
  - Each question shows numbered options plus "Other: [describe]"
  - User can answer with just the number or type a custom answer
  - After answers collected, summarize back: "Here's what I understood — confirm or correct before we proceed"
  - This prevents hallucinated assumptions like "I'll use Redux" or "I'll set up Docker"
- Support `--from-prd <file>` flag to skip questions and read a PRD document instead
- Spawn a **research subagent** (planner persona) in a fresh context to analyze the domain
- Generate in `.threadwork/state/`:
  - `PROJECT.md`: High-level vision and principles
  - `REQUIREMENTS.md`: Functional requirements with REQ-ID format (REQ-001, REQ-002, etc.)
  - `ROADMAP.md`: Milestone → Phase → Plan hierarchy
  - `STATE.json`: Machine-readable project state
- For brownfield projects: run `tw:analyze-codebase` first to map existing structure
- Record initial spec decisions into `.threadwork/specs/` as starter entries
- Commit all generated files with a standard init commit message

**Inputs**: User description or `--from-prd` file path
**Outputs**: `.threadwork/state/` scaffold, clarifying questions answered, initial git commit

---

#### C2. Phase Discussion (`/tw:discuss-phase <N>`)
**Slash command.**

**Purpose**: Capture developer preferences and decisions for a phase before planning begins.

**Requirements**:
- Read the phase definition from `ROADMAP.md`
- Ask targeted questions about the phase: preferred libraries/patterns, constraints, known risks
- Generate `CONTEXT.md` for the phase in `.threadwork/state/phases/phase-N/`
- Update the spec library with any new decisions captured (via `spec-engine.js`)
- Record decisions with rationale
- If a phase has been discussed before, diff against previous context and ask only about changes

**Inputs**: Phase number
**Outputs**: `CONTEXT.md`, updated spec entries

---

#### C3. Phase Planning (`/tw:plan-phase <N>`)
**Slash command.**

**Purpose**: Generate a detailed, executable plan for a phase as structured task files. Includes token estimates for every task.

**Requirements**:
- Require that `CONTEXT.md` exists for the phase
- Spawn the **planner subagent** with project requirements, phase context, and relevant specs
- Planner generates plans in XML format:
  ```xml
  <plan id="PLAN-N-1" phase="N" milestone="M">
    <title>...</title>
    <requirements>REQ-001, REQ-003</requirements>
    <tasks>
      <task id="T-N-1-1">
        <description>...</description>
        <files>src/components/Auth.tsx, src/hooks/useAuth.ts</files>
        <verification>Tests pass, TypeScript compiles, no lint errors</verification>
        <done-condition>Auth flow completes end-to-end</done-condition>
        <token-estimate>12000</token-estimate>
      </task>
    </tasks>
    <dependencies>PLAN-N-2 depends on PLAN-N-1</dependencies>
  </plan>
  ```
- Spawn the **plan-checker subagent** to validate plans across 6 dimensions:
  1. Requirements coverage
  2. File target clarity
  3. Verification criteria completeness
  4. Done conditions measurability
  5. Dependency graph validity
  6. Spec compliance
- Iterate plan-checker loop up to 3 times if quality threshold not met
- **After plans are approved**: call `token-tracker.js` to sum all task token estimates for the phase and display a **Phase Budget Preview**: `"Phase 2 estimated total: ~180K tokens across 14 tasks. Your session budget is 800K. This phase fits in one session."`
- Save approved plans to `.threadwork/state/phases/phase-N/plans/PLAN-N-*.xml`
- Save dependency graph to `.threadwork/state/phases/phase-N/deps.json`

**Inputs**: Phase number
**Outputs**: XML plan files, dependency graph, phase budget preview

---

#### C4. Phase Execution (`/tw:execute-phase <N>`)
**Slash command. The core execution engine.**

**Purpose**: Execute all plans for a phase using parallel wave execution with fresh-context subagents.

**Requirements**:
- Read all plans and dependency graph
- Group plans into **parallel waves** using topological sort
- For each wave, spawn `executor` subagents in parallel via Task()
- Each executor receives its PLAN XML, relevant specs (injected by pre-tool-use hook), tech stack context, and git branch
- Executor behavior:
  - Implement tasks sequentially within the plan
  - Make atomic git commits after each task: `git commit -m "T-N-1-1: <description>"`
  - Write `SUMMARY.md` when plan completes
  - Handle checkpoints via the checkpoint protocol
- **Before each task**: check `token-tracker.getBudgetRemaining()` — if below 20%, show warning banner; if below 10%, pause and ask user whether to continue or end session
- Orchestrator monitors progress, runs spot checks on outputs
- On wave completion, validate before proceeding to next wave
- Write phase execution log to `.threadwork/state/phases/phase-N/execution-log.json`
- Support `--yolo` mode (auto-approve all checkpoints) and interactive mode

**Inputs**: Phase number, optional `--wave <N>`, `--plan <ID>`
**Outputs**: Implemented code, atomic commits, SUMMARY.md files, execution log

---

#### C5. Phase Verification (`/tw:verify-phase <N>`)
**Slash command.**

**Purpose**: Goal-backward verification that phase output meets requirements. Includes token variance report as part of the output.

**Requirements**:
- Read phase requirements
- Spawn **verifier subagent** to check REQ-IDs, done conditions, integrations, regressions
- Run automated quality checks via `quality-gate.js`
- Generate `VERIFICATION.md` with per-requirement pass/fail and evidence
- If failures found: spawn **debugger subagent** with hypothesis-testing protocol
- Generate `UAT.md` for manual verification steps
- **Phase Variance Report** (NEW): After verification, call `token-tracker.getBudgetReport()` and append to `VERIFICATION.md`:
  - Total estimated tokens for this phase vs actual tokens used
  - Per-task variance (Excellent <±10%, Good ±10–20%, Needs Improvement >±20%)
  - Lessons for future phase estimates
- Update `STATE.json` to `PHASE_VERIFIED` status only on full pass

**Inputs**: Phase number
**Outputs**: `VERIFICATION.md` (with variance report), `UAT.md`, updated state

---

#### C6. Quick Task (`/tw:quick <description>`)
**Slash command. For tasks that don't need full phase orchestration.**

**Requirements**:
- Auto-generate a minimal plan from the task description
- **Show token estimate** before starting: "This task is estimated at ~8K tokens. Proceed?"
- Optional `--full` flag to add plan-checking and verification
- Spawn single executor agent
- Commit on completion
- Update journal and token log with the quick task entry

---

#### C7. State Management (`lib/state.js`)
**Internal library.**

**Purpose**: Deterministic, token-free state operations.

**Requirements**:
- `readState()` / `writeState(data)`: Read/write `STATE.json`
- `setPhase(n)` / `getPhase()`: Update current phase
- `setMilestone(n)` / `getMilestone()`: Update current milestone
- `addCompletedTask(taskId)`: Append to completed task list
- `setActiveTask(taskId, planId)`: Update active task
- `clearActiveTask()`: On task completion
- `readRequirements()`: Parse `REQUIREMENTS.md` and return structured array
- `readRoadmap()`: Parse `ROADMAP.md` into milestone/phase/plan hierarchy
- `readPlan(planId)`: Parse a specific XML plan file
- `listPlans(phaseN)`: List all plan files for a phase
- `markPlanComplete(planId)`: Update plan status
- `getGitInfo()`: Returns current branch, last commit SHA, uncommitted files
- `writeAtomicCommit(message)`: Runs `git add -A && git commit -m "<message>"`
- All functions synchronous, pure JS/file operations, no Claude involvement

---

### LAYER D — KNOWLEDGE MANAGEMENT (Trellis Core Functions)

---

#### D1. Spec Engine (`lib/spec-engine.js`)
**Internal library.**

**Purpose**: Manage the spec library — read, write, update, search, and inject specs.

**Requirements**:
- `loadSpecIndex()`: Read `.threadwork/specs/index.md`
- `loadSpec(domain, specName)`: Read a specific spec file
- `loadDomainSpecs(domain)`: Load all specs for a domain
- `getRelevantSpecs(taskDescription, phase)`: Smart selection by keyword + phase heuristics
- `writeSpec(domain, specName, content)`: Create or update a spec file + update index
- `proposeSpecUpdate(specName, newContent, reason)`: Write pending proposal to `.threadwork/specs/proposals/`
- `acceptProposal(proposalId)`: Promote proposal to active spec
- `searchSpecs(query)`: Full-text search across all spec files
- `buildInjectionBlock(specFiles)`: Compose injection string, respecting token budget
- `getSpecTokenCount(specFiles)`: Estimate token count before injecting

Spec file format:
```markdown
---
domain: frontend
name: react-patterns
updated: 2025-02-01
confidence: 0.9
tags: [react, hooks, state]
---
# React Patterns

## Rule: Always use custom hooks for business logic
...
```

---

#### D2. Pre-Tool-Use Hook — Spec Injection (`hooks/pre-tool-use.js`)
**Fires at**: Every `Task()` call (subagent spawn)

**Purpose**: Inject relevant spec context into every subagent prompt automatically.

**Requirements**:
- Parse the incoming `Task()` call to extract task description, agent type, phase context
- Call `spec-engine.getRelevantSpecs()` and `buildInjectionBlock()`
- **Read skill tier** from `project.json` and append appropriate verbosity instruction to the injection block:
  - Beginner: "Explain your reasoning as you go. Include comments in code."
  - Advanced: "Be concise. Skip obvious explanations."
  - Ninja: "Minimal output. Code only, no narration unless asked."
- Prepend full injection block to the subagent's prompt
- Log injected specs and token count to `.threadwork/state/hook-log.json`
- Enforce max injection size (configurable, default 8000 tokens)
- For **Codex**: write injection block to a temp file that AGENTS.md instructs agents to read first

---

#### D3. Post-Tool-Use Hook — Learning Capture (`hooks/post-tool-use.js`)
**Fires at**: After every tool call completes

**Purpose**: Capture learning signals, update token tracking, write checkpoint.

**Requirements**:
- Parse tool call result for learning signals:
  - Linting error encountered and fixed → spec proposal
  - TypeScript error corrected → fix pattern proposal
  - Test written that caught a bug → test pattern proposal
  - Task tokens significantly over/under estimate → record variance
- Write detected patterns to `.threadwork/specs/proposals/` with confidence 0.3
- **Update token tracking**: record actual tool call size, update session running total, check thresholds:
  - If session total crosses 80% of budget → write a `WARNING` entry to hook-log and the next session-start will surface it
  - If session total crosses 90% of budget → write a `CRITICAL` entry; the hook emits a visible warning to the user via stdout
- Write checkpoint after each tool completion
- Keep hook execution under 50ms; defer heavy work to async queues

---

#### D4. Subagent Stop Hook — Quality Gate (`hooks/subagent-stop.js`)
**Fires at**: When a subagent completes (`SubagentStop` event)

**Purpose**: The Ralph Loop. Block subagent completion until quality gates pass.

**Requirements**:
- Read the subagent's type — skip for non-code agents (planner, verifier, researcher)
- Run quality gate suite via `quality-gate.js`:
  - TypeScript: `tsc --noEmit`
  - Lint: `eslint . --max-warnings 0` (or configured linter)
  - Tests: `npm test -- --passWithNoTests`
  - Build (optional): only if `--build-check` flag set
- If all gates pass: allow completion, write success to journal
- If gates fail:
  - Increment retry counter in `.threadwork/state/ralph-state.json`
  - If retries < max (default 5): re-invoke subagent with correction prompt
  - If retries >= max: escalate to user clearly
- Clear ralph-state on successful completion
- For **Codex**: implement as post-task verification command (`/tw:verify-quick`) or instruct executor agent to self-invoke quality check before declaring done

---

#### D5. Quality Gate Runner (`lib/quality-gate.js`)
**Internal library.**

**Requirements**:
- `runAll(options)`: Returns `{ passed: bool, results: [] }`
- `runTypecheck()`: Runs `tsc --noEmit`, returns `{ passed, errors: [] }`
- `runLint()`: Auto-detect linter (eslint, biome, oxlint), returns `{ passed, errors: [] }`
- `runTests(filter?)`: Returns `{ passed, failures: [], coverage: N }`
- `runBuild()`: Returns `{ passed, errors: [] }`
- `runSecurityScan()`: Runs `npm audit --audit-level high`, returns `{ passed, vulnerabilities: [] }`
- Auto-detect which tools are installed; skip gracefully if absent
- Cache results per git commit SHA to avoid redundant runs
- Configurable via `.threadwork/state/quality-config.json` (which gates are enabled, which are blocking, thresholds)

---

#### D6. Spec Proposals and Review (`/tw:specs`)
**Slash command.**

**Requirements**:
- `/tw:specs list` — list all specs by domain with last-updated date and confidence
- `/tw:specs show <domain/name>` — display a spec file
- `/tw:specs proposals` — list all pending AI-proposed updates
- `/tw:specs accept <proposalId>` — promote proposal to active spec
- `/tw:specs reject <proposalId>` — discard proposal
- `/tw:specs add <domain>` — open prompt to write a new spec manually
- `/tw:specs edit <domain/name>` — open existing spec for editing
- `/tw:specs search <query>` — search across all specs

---

### LAYER E — TOKEN & BUDGET MANAGEMENT

---

#### E1. Token Tracker (`lib/token-tracker.js`)
**Internal library. First-class feature throughout the entire lifecycle.**

**Purpose**: Track token usage across tasks and sessions, surface budget warnings at key thresholds, and report estimation variance to improve future planning.

**Requirements**:

**Estimation functions**:
- `estimateTokens(text)`: Rough estimate (chars/4) — no API call needed
- `estimateTaskBudget(taskDescription, phase)`: Heuristic estimate:
  - Simple task (1–2 files, clear scope): 5K–15K tokens
  - Medium task (3–5 files, some complexity): 15K–40K tokens
  - Complex task (6+ files, architecture decisions): 40K–80K tokens
  - Multiplier applied based on phase (planning phases cheaper than execution phases)

**Budget tracking functions**:
- `getSessionBudget()`: Returns configured session budget from `project.json` (default 800K)
- `getSessionUsed()`: Returns estimated tokens consumed this session (from hook-log running total)
- `getBudgetRemaining()`: `getSessionBudget() - getSessionUsed()`
- `getBudgetPercent()`: Returns 0–100 integer representing % consumed
- `checkThresholds()`: Returns `{ warning: bool, critical: bool }` — `warning` true at ≥80%, `critical` true at ≥90%
- `shouldCheckBudget()`: Returns true if below 20% remaining (triggers check before each new task)
- `isOverBudget()`: Returns true if critically low (<10% remaining)

**Recording and variance functions**:
- `recordUsage(taskId, estimatedTokens, actualTokens?)`: Log to `.threadwork/state/token-log.json`
- `getBudgetReport()`: Returns full variance summary:
  ```json
  {
    "session": { "budget": 800000, "used": 312000, "remaining": 488000, "percent": 39 },
    "tasks": [
      { "id": "T-1-1-1", "estimated": 12000, "actual": 14200, "variance": "+18%", "rating": "Good" },
      { "id": "T-1-1-2", "estimated": 8000, "actual": 7100, "variance": "-11%", "rating": "Good" }
    ],
    "phaseTotal": { "estimated": 180000, "actual": 156000, "variance": "-13%" }
  }
  ```
- `getVarianceRating(estimated, actual)`: Returns `"Excellent"` (<±10%), `"Good"` (±10–20%), `"Needs Improvement"` (>±20%)
- `formatBudgetDashboard()`: Returns a single-line status string for hook injection:
  `"[TOKEN: 312K/800K used | 61% remaining | ⚠ Warning: >80% consumed]"`

**Threshold behavior** (enforced by post-tool-use hook reading this module):
- At **80%** consumed: inject warning into next prompt — "⚠️ Token budget at 80%. Consider wrapping up or starting a new session after the current task."
- At **90%** consumed: inject critical warning — "🚨 Token budget at 90%. Finish current task and run `/tw:done` to generate handoff before context is lost."
- At **95%** consumed: automatically trigger handoff generation even without user command

---

#### E2. Token Commands
**Slash commands.**

**`/tw:budget`**
- Show current session budget dashboard:
  ```
  ── Threadwork Token Budget ─────────────────────
  Session budget:   800,000 tokens
  Used this session: 312,000 tokens  (39%)
  Remaining:         488,000 tokens  (61%)
  
  Status: ✅ Healthy
  
  Last 3 tasks:
    T-1-1-1  est 12K  actual 14K  +18%  Good
    T-1-1-2  est  8K  actual  7K  -11%  Good
    T-1-1-3  est 20K  actual 31K  +55%  Needs Improvement
  ───────────────────────────────────────────────
  ```
- Show warning indicator if ≥80%, critical if ≥90%

**`/tw:estimate <task description>`**
- Show token estimate before committing to a task:
  ```
  Task: "Add JWT refresh token rotation"
  Complexity: Medium (auth logic, 2–3 files)
  Estimate:   15,000 – 25,000 tokens
  
  Current remaining budget: 488K tokens
  This task would consume: ~3% of remaining budget
  Verdict: ✅ Safe to proceed
  ```

**`/tw:tokens`**
- Full session token log with per-task breakdown and running total
- Include phase totals and cumulative project usage across all sessions

**`/tw:variance`** (NEW — dedicated variance command)
- Show full variance report for current phase:
  - Table of estimated vs actual per task
  - Phase total estimate vs actual
  - Variance ratings with recommendations ("Your complex tasks are consistently underestimated by 40–60% — add a 1.5x multiplier for future planning")

---

### LAYER F — RECALL & SEARCH

---

#### F1. Knowledge Recall (`/tw:recall <query>`)
**Slash command.**

**Purpose**: Search across journals, specs, handoffs, and project history.

**Requirements**:
- Search `.threadwork/workspace/journals/` (full-text)
- Search `.threadwork/workspace/handoffs/` (full-text)
- Search `.threadwork/specs/` (full-text)
- Search `REQUIREMENTS.md` and `ROADMAP.md`
- Search `CONTEXT.md` files for all phases
- Rank results by recency + relevance
- Return top 5 results with source file, excerpt, and date

---

### LAYER G — PARALLEL DEVELOPMENT

---

#### G1. Parallel Worktree Execution (`/tw:parallel <description>`)
**Slash command.**

**Requirements**:
- Create a git worktree at `.threadwork/worktrees/<feature-name>/`
- Copy `.threadwork/specs/` into the worktree for spec access
- Spawn dispatch agent: Implement → Check → Ralph Loop → Finish → PR
- Ralph Loop runs in the worktree context
- On completion: create draft PR or print merge instructions
- Clean up worktree on successful merge or `/tw:parallel cancel`
- Support `--dry-run`

---

### LAYER H — CODEBASE ANALYSIS (Brownfield Support)

---

#### H1. Codebase Mapping (`/tw:analyze-codebase`)
**Slash command.**

**Requirements**:
- Scan project root for `package.json`, `tsconfig.json`, framework config files
- Auto-detect: framework, language, test runner, linter
- Spawn analysis subagent to generate initial spec library entries, architecture summary, and dependency map
- Write results to `.threadwork/state/codebase-map.json`
- Skip files matching `.gitignore`

---

### LAYER I — SKILL TIER SYSTEM

---

#### I1. Skill Tier Configuration (`lib/skill-tier.js`)
**Internal library. Set at `threadwork init`, changeable at any time.**

**Purpose**: Control output verbosity, explanation depth, and guidance level across all Threadwork outputs — so Beginners get hand-holding while Ninja developers get zero noise.

**Three tiers**:

**Beginner**
- All agent outputs include inline comments in generated code
- Reasoning is explained step-by-step before implementation
- Quality gate failures include explanation of what the error means and why it matters
- Slash command outputs include "what this did" summaries
- Token budget warnings include brief explanation of why token management matters
- Phase transitions include "you are here" orientation

**Advanced** (default)
- Code comments only for non-obvious logic
- Reasoning summarized in 1–2 sentences, not elaborated
- Quality gate failures show errors and fix, no background explanation
- Slash command outputs are information-dense, no hand-holding
- Token warnings are brief one-liners
- Phase transitions are terse status updates

**Ninja**
- Minimal output — code only, no narration
- Reasoning omitted unless explicitly requested
- Quality gate failures show raw error output and correction only
- Slash commands output machine-readable-style compact summaries
- Token warnings: single emoji + number only (`🚨 91%`)
- No orientation, no summaries, no explanations unless asked

**Requirements for `lib/skill-tier.js`**:
- `getTier()`: Read current tier from `.threadwork/state/project.json`
- `setTier(tier)`: Write tier to `project.json` (validates: must be 'beginner', 'advanced', or 'ninja')
- `getTierInstructions()`: Returns the verbosity instruction string injected into every subagent prompt via the pre-tool-use hook
- `formatOutput(content, context)`: Applies tier-appropriate formatting to command outputs
- `getWarningStyle(level)`: Returns tier-appropriate warning format for 'info', 'warning', 'critical' levels

**Slash command**:
- `/tw:tier` — show current tier
- `/tw:tier set <beginner|advanced|ninja>` — change tier immediately; takes effect on next hook invocation

---

### LAYER J — SESSION HANDOFF COMMANDS

---

#### J1. Handoff Commands (`/tw:done`, `/tw:handoff`, `/tw:resume`)

**`/tw:done`** (or user says "I'm done for now")
- Triggers `handoff.generateHandoff()`
- Writes the 10-section handoff document
- Prints the Resume Prompt block to the terminal so user can copy it
- Writes final checkpoint
- Prints: "Session saved. Paste the resume prompt above to pick up where you left off."

**`/tw:handoff`**
- `/tw:handoff` — generate handoff for current session (same as `/tw:done` but without ending)
- `/tw:handoff list` — list all past handoffs with dates and phase context
- `/tw:handoff show <N>` — display a specific handoff
- `/tw:handoff resume` — print the resume prompt from the most recent handoff

**`/tw:resume`**
- Show the resume prompt from the most recent handoff
- Optionally: load checkpoint state and announce readiness ("Loaded: Phase 2, Task T-2-1-3, Branch feature/auth, 488K tokens remaining. Ready to continue.")

---

## Part 2: Full Slash Command Reference

| Command | Description | Phase Required |
|---|---|---|
| `/tw:new-project` | Initialize project with clarifying questions | — |
| `/tw:analyze-codebase` | Map brownfield codebase | — |
| `/tw:discuss-phase <N>` | Capture phase preferences before planning | Any |
| `/tw:plan-phase <N>` | Generate XML execution plans + phase budget preview | After discuss |
| `/tw:execute-phase <N>` | Run parallel wave execution | After plan |
| `/tw:verify-phase <N>` | Goal-backward verification + variance report | After execute |
| `/tw:quick <desc>` | Fast-path for small tasks (shows estimate first) | Any |
| `/tw:parallel <desc>` | Isolated worktree parallel execution | Any |
| `/tw:recall <query>` | Search journals, specs, handoffs, history | Any |
| `/tw:specs` | Spec library management | Any |
| `/tw:budget` | Token budget dashboard | Any |
| `/tw:estimate <desc>` | Pre-task token estimate | Any |
| `/tw:tokens` | Full session token log | Any |
| `/tw:variance` | Phase variance report (estimated vs actual) | Any |
| `/tw:done` | End session — generate 10-section handoff + resume prompt | Any |
| `/tw:handoff` | Handoff management (list, show, resume) | Any |
| `/tw:resume` | Load most recent handoff and announce ready state | Session start |
| `/tw:tier` | View or change skill tier (beginner/advanced/ninja) | Any |
| `/tw:recover` | Restore from checkpoint after crash | Any |
| `/tw:journal` | View/search session journals | Any |
| `/tw:status` | Full project status dashboard | Any |
| `/tw:clear` | Clear context between phases | End of phase |
| `/tw:audit-milestone` | Review milestone against requirements | End of milestone |

---

## Part 3: Agent Roster

| Agent | Persona | Context Size | Model Profile |
|---|---|---|---|
| `tw-planner` | Senior Software Architect | Large (fresh 200K) | Quality (Opus) |
| `tw-researcher` | Domain Research Analyst | Large (fresh 200K) | Quality (Opus) |
| `tw-plan-checker` | Requirements Validation Specialist | Medium | Balanced (Sonnet) |
| `tw-executor` | Senior Developer | Large (fresh 200K) | Balanced (Sonnet) |
| `tw-verifier` | QA Engineer | Medium | Balanced (Sonnet) |
| `tw-debugger` | Debugging Specialist | Large (fresh 200K) | Quality (Opus) |
| `tw-dispatch` | Parallel Work Coordinator | Small | Budget (Haiku) |
| `tw-spec-writer` | Standards Curator | Small | Budget (Haiku) |

All agents receive two additional injections from the pre-tool-use hook:
1. **Skill tier instruction** — controls output verbosity for this agent's responses
2. **Token budget status** — so agents are aware of remaining budget and can self-regulate

---

## Part 4: Hook Registration Format

### Claude Code (`~/.claude/settings.json`)
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node ~/.threadwork/hooks/session-start.js"
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [{
          "type": "command",
          "command": "node ~/.threadwork/hooks/pre-tool-use.js"
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node ~/.threadwork/hooks/post-tool-use.js"
        }]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node ~/.threadwork/hooks/subagent-stop.js"
        }]
      }
    ]
  }
}
```

### Codex (`AGENTS.md` equivalent)
```markdown
## Threadwork Context Protocol
- At the start of every task, read `.threadwork/state/checkpoint.json` and the latest file in `.threadwork/workspace/handoffs/` for context
- Before implementing any code, read relevant spec files from `.threadwork/specs/`
- After completing any task, run: `node .threadwork/hooks/quality-check.js` and fix all errors before reporting done
- Write a checkpoint to `.threadwork/state/checkpoint.json` after each completed task
- Check `.threadwork/state/token-log.json` before starting a new task — if session budget is >90% consumed, stop and notify the user
```

---

## Part 5: Directory Structure (Installed in User Project)

```
your-project/
├── THREADWORK.md                     # Framework guide (auto-loaded by Claude Code)
├── .threadwork/
│   ├── state/
│   │   ├── project.json             # Project metadata + current state + skill tier + budget config
│   │   ├── checkpoint.json          # Recovery checkpoint
│   │   ├── active-task.json         # Currently executing task
│   │   ├── completed-tasks.json     # Task completion log
│   │   ├── token-log.json           # Token usage tracking + variance data
│   │   ├── hook-log.json            # Hook execution log + threshold events
│   │   ├── ralph-state.json         # Quality gate retry state
│   │   ├── quality-config.json      # Quality gate configuration
│   │   ├── codebase-map.json        # Brownfield analysis output
│   │   └── phases/
│   │       └── phase-N/
│   │           ├── CONTEXT.md       # Phase discussion output
│   │           ├── deps.json        # Plan dependency graph
│   │           ├── execution-log.json
│   │           ├── VERIFICATION.md  # Includes token variance report
│   │           ├── UAT.md
│   │           └── plans/
│   │               └── PLAN-N-*.xml # Includes token-estimate per task
│   ├── specs/
│   │   ├── index.md
│   │   ├── frontend/
│   │   ├── backend/
│   │   ├── testing/
│   │   └── proposals/
│   ├── workspace/
│   │   ├── journals/                # Session journals (YYYY-MM-DD-N.md)
│   │   ├── handoffs/                # 10-section session handoffs (YYYY-MM-DD-N.md)
│   │   └── archive/                 # Journals + handoffs older than 30 days
│   └── worktrees/                   # Parallel execution worktrees
├── .planning/                       # GSD-compatible alias (for gradual migration)
└── docs/
```

---

## Part 6: Key Design Decisions and Rationale

### Why JS hooks instead of Python?
- Node.js is a universal dependency for npm-based installs
- Faster startup than Python for frequent hook calls
- Better JSON handling for state files

### Why `.threadwork/` as the single namespace?
- Single unified directory prevents confusion
- Easier to exclude from deliverables (one `.gitignore` entry)
- Backward compatible: `.planning/` kept as alias for GSD-migrating users

### Why XML plans instead of Markdown?
- Machine-parseable without LLM involvement
- REQ-ID references are unambiguous
- `state.js` can parse plans in pure JS without Claude

### Why 800K as the default session budget?
- Sonnet's context window is ~1M tokens
- 80% of 1M leaves headroom for system prompts, hook injections, and framework overhead
- Configurable at init time for users on different models or tighter budgets

### Why clarifying questions before requirements generation?
- Prevents hallucinated assumptions about tech stack, team, and constraints
- Multiple-choice format is fast — answering 7 questions takes under 2 minutes
- The "Other" option ensures no developer is forced into a wrong answer
- Results in a REQUIREMENTS.md that actually reflects the project instead of AI guesses

### Why three skill tiers instead of a verbosity slider?
- Three named tiers are memorable and fast to set
- Each tier has a coherent philosophy, not just "more or less text"
- Ninja mode is specifically designed for developers who find AI commentary patronizing
- Tier is injected into every agent prompt, so it applies uniformly without per-command configuration

### How Codex compatibility works
Codex doesn't support Claude Code's hook event system. Threadwork handles this via:
1. **AGENTS.md behavioral injection**: Hook logic expressed as mandatory behavioral instructions
2. **Polling-based quality check**: Codex agents self-invoke `node .threadwork/hooks/quality-check.js` before declaring task complete
3. **Session context file**: `CONTEXT_RESUME.md` written at session end, read at next session start (replaces `SessionStart` hook)
4. **Token budget via AGENTS.md**: Codex agents instructed to read `token-log.json` before each task

Claude Code users get full hook-enforced behavior. Codex users get prompt-behavioral enforcement — same quality level, slightly less automatic.
