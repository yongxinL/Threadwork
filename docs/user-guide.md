# Threadwork User Guide

**Version:** 1.0 | **Package:** `threadwork-cc` | **Runtime:** Claude Code / Codex

---

## Table of Contents

1. [What is Threadwork?](#1-what-is-threadwork)
2. [Installation](#2-installation)
3. [Core Concepts](#3-core-concepts)
4. [Getting Started](#4-getting-started)
5. [The Phase Workflow](#5-the-phase-workflow)
6. [Slash Command Reference](#6-slash-command-reference)
7. [Skill Tier System](#7-skill-tier-system)
8. [Token Budget System](#8-token-budget-system)
9. [Session Handoff System](#9-session-handoff-system)
10. [Spec Library](#10-spec-library)
11. [Hook System](#11-hook-system)
12. [Agent Roster](#12-agent-roster)
13. [Directory Structure](#13-directory-structure)
14. [Configuration Reference](#14-configuration-reference)
15. [Starting from an Existing Blueprint](#15-starting-from-an-existing-blueprint)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What is Threadwork?

Threadwork is an AI workflow orchestration layer that sits on top of Claude Code (or Codex). It gives AI coding sessions structure, memory, and quality enforcement that survive across multiple sessions.

It provides:

- **Spec-driven project orchestration** — phases, milestones, planning, and parallel execution
- **Hook-enforced spec injection** — conventions and patterns injected automatically into every agent
- **Automated quality gates** — the Ralph Loop blocks completion until lint, typecheck, and tests pass
- **Token budgeting** — track and estimate usage before you run out of context
- **Structured session handoffs** — end every session with a resume prompt that restores full context
- **Skill-tier-aware output** — the AI adjusts verbosity to your experience level

The core principle is **hook-first architecture**: all intelligence is driven by four JavaScript hooks registered in Claude Code settings, not passive CLAUDE.md files. Specs, tier instructions, and budget warnings are injected automatically at the right moment — you don't have to remember to ask.

---

## 2. Installation

### Requirements

- Node.js ≥ 18 (Node 22 LTS recommended)
- npm ≥ 10
- Claude Code or Codex

```bash
node --version   # v22.x.x
npm --version    # 10.x.x
```

### Install from npm (recommended)

```bash
# Install globally
npx threadwork-cc@latest

# In your project directory:
threadwork init
```

### Install from source

```bash
git clone https://github.com/nexora/threadwork.git
cd threadwork

npm install
npm test              # unit tests (40 tests)
npm run test:all      # unit + integration tests (78 tests)

# Link globally
npm link

# Confirm
threadwork --version
```

### Unlink when done developing

```bash
npm unlink -g threadwork-cc
```

---

## 3. Core Concepts

Before diving into commands, it helps to understand the five systems that Threadwork runs.

### Phases and Milestones

Work is organized into **phases** (discrete units of work with plans and tasks) grouped under **milestones** (higher-level goals). You plan a phase before executing it, verify it after, and clear it when done.

### The Ralph Loop

The Ralph Loop is Threadwork's quality enforcement mechanism. After every subagent finishes work, the `subagent-stop` hook automatically runs your quality gates (lint, typecheck, tests). If any gate fails, the agent receives a correction prompt and retries — up to 5 times. Completion is blocked until gates pass or retries are exhausted.

Gates auto-detect available tools: `eslint`, `biome`, `oxlint`, `tsc`, and your `npm test` script. Results are cached per git commit SHA so unchanged code is never rechecked.

### Spec Library

Specs are markdown files describing your project's conventions — API design patterns, auth approach, testing standards, component structure. They live in `.threadwork/specs/` and are injected automatically into every subagent that handles relevant tasks. The spec engine uses keyword matching and an 8K token injection budget to select only what's needed.

### Skill Tiers

Your declared experience level (`beginner`, `advanced`, `ninja`) controls how the AI communicates — explanation depth, comment density, error message verbosity, and orientation blocks. The tier is injected into every subagent prompt automatically.

### Token Budget

Every Claude session has a finite context window. Threadwork tracks estimated token usage, warns you at 80% and 90%, and at 95% auto-generates a handoff to preserve your work before context is lost.

---

## 4. Getting Started

### Step 1: Run `threadwork init`

In your project directory:

```bash
threadwork init
```

This walks you through six questions:

| # | Question | Options |
|---|----------|---------|
| 1 | Project name | Free text |
| 2 | Tech stack | Next.js+TS / React+Vite+TS / Express / FastAPI / Other |
| 3 | Quality thresholds | Coverage % + lint level (strict / standard / relaxed) |
| 4 | Team mode | Solo / Small team (2–3) / Team (4+) |
| 5 | Skill tier | Beginner / Advanced (default) / Ninja |
| 6 | Session token budget | Default: 800K |

After answering, `threadwork init` will:

- Scaffold `.threadwork/` with all required subdirectories
- Write `project.json`, `quality-config.json`, `token-log.json`
- Copy 4 hooks into `.threadwork/hooks/`
- Register hooks in `~/.claude/settings.json` (Claude Code) or inject into `AGENTS.md` (Codex)
- Install 23 slash commands to `~/.claude/commands/tw/`
- Install 8 agent definitions to `~/.claude/agents/`
- Copy the project-level guide as `CLAUDE.md` (or `AGENTS.md` for Codex)
- Copy the starter spec library into `.threadwork/specs/`

**Dry run mode** (preview without writing files):

```bash
threadwork init --dry-run
```

**Force a specific runtime** (skip auto-detection):

```bash
threadwork init --runtime claude-code
threadwork init --runtime codex
```

### Step 2: Start a new Claude Code session

After `threadwork init`, start a fresh Claude Code session in your project. The `session-start` hook fires automatically and injects:

- Project name, phase, milestone, and active task
- Token budget status
- Skill tier instructions
- A checkpoint warning if an incomplete session was detected

### Step 3: Initialize your project

In Claude Code, run:

```
/tw:new-project
```

This asks seven clarifying questions and generates three files:

- `PROJECT.md` — goals, scope, constraints, success criteria
- `REQUIREMENTS.md` — structured functional and non-functional requirements
- `ROADMAP.md` — milestone and phase breakdown with acceptance criteria

For an existing codebase:

```
/tw:analyze-codebase
```

This maps the project structure, detects your framework, generates an architecture summary, and creates a starter spec library tailored to what it finds.

---

## 5. The Phase Workflow

The standard workflow for each phase follows this sequence:

```
discuss-phase → plan-phase → execute-phase → verify-phase → clear
```

For milestone-level review, add `audit-milestone` at the end of each milestone.

### `/tw:discuss-phase <N>`

Before planning, capture developer preferences and decisions:

- Which libraries or patterns to use
- Architectural constraints
- Things to avoid
- Open questions

Output is saved to `.threadwork/state/phases/phase-N/discussion.md` and injected into the planner.

### `/tw:plan-phase <N>`

Spawns the `tw-planner` agent (Opus) to generate XML execution plans with token estimates.

- Reads your `REQUIREMENTS.md`, `ROADMAP.md`, and phase discussion notes
- Produces `PLAN-N-*.xml` files in `.threadwork/state/phases/phase-N/plans/`
- Each plan includes task IDs, dependencies, and per-task token estimates
- Displays a phase budget preview before finalizing

The `tw-plan-checker` agent (Sonnet) validates plans across six quality dimensions before they're accepted.

Preview the token cost of a plan before committing:

```
/tw:estimate generate the auth middleware for phase 2
```

### `/tw:execute-phase <N>`

Executes all plans using parallel wave execution:

1. Reads all plan XMLs and a `deps.json` dependency graph
2. Topologically sorts plans into parallel waves
3. Displays the wave structure:

```
Phase 2 Execution Plan:
  Wave 1 (parallel): PLAN-2-1, PLAN-2-2, PLAN-2-3
  Wave 2 (parallel): PLAN-2-4, PLAN-2-5
  Wave 3 (sequential): PLAN-2-6
Total: 6 plans, 18 tasks
```

4. Spawns `tw-executor` agents in parallel for each plan in a wave
5. Each executor receives its plan XML, project context, git branch info, and relevant specs (via hook)
6. After each wave, checks token budget and git commits
7. Ralph Loop runs after every executor completes

**Flags:**

| Flag | Effect |
|------|--------|
| `--wave <N>` | Execute only wave N |
| `--plan <ID>` | Execute only one plan |
| `--yolo` | Skip all interactive checkpoints, auto-continue |

### `/tw:verify-phase <N>`

Spawns the `tw-verifier` agent (Sonnet) to perform goal-backward verification:

- Reads requirements and maps each one to completed tasks
- Checks that all acceptance criteria are met
- Identifies any gaps or regressions
- Generates a token variance report: estimated vs actual per task, with improvement recommendations

### `/tw:clear`

Closes the current phase and advances to the next:

- Writes a phase handoff document
- Clears the active checkpoint
- Updates `currentPhase` in `project.json`
- Archives phase state

### `/tw:audit-milestone <N>`

After completing all phases in a milestone, runs a cross-phase verification:

- Reviews every completed phase against the milestone's acceptance criteria
- Checks for inter-phase inconsistencies
- Produces a milestone sign-off report

---

## 6. Slash Command Reference

All commands use the `/tw:` prefix. They are installed to `~/.claude/commands/tw/`.

### Project Setup

| Command | Description |
|---------|-------------|
| `/tw:new-project` | 7 clarifying questions → `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` |
| `/tw:analyze-codebase` | Map brownfield project → detect framework, generate starter specs |

### Phase Workflow

| Command | Description |
|---------|-------------|
| `/tw:discuss-phase <N>` | Capture library/pattern decisions before planning |
| `/tw:plan-phase <N>` | Generate XML plans with token estimates + phase budget preview |
| `/tw:execute-phase <N>` | Parallel wave execution with spec injection + Ralph Loop |
| `/tw:verify-phase <N>` | Goal-backward verification + token variance report |
| `/tw:clear` | Close phase, write phase handoff, advance to next |
| `/tw:audit-milestone <N>` | Cross-phase milestone verification |

### Task Execution

| Command | Description |
|---------|-------------|
| `/tw:quick <desc>` | Fast-path task — shows estimate, executes, commits |
| `/tw:parallel <desc>` | Isolated worktree execution → creates a draft PR |

### Token Budget

| Command | Description |
|---------|-------------|
| `/tw:budget` | Session budget dashboard |
| `/tw:estimate <desc>` | Token estimate before committing to a task |
| `/tw:tokens` | Full session token log with per-task breakdown |
| `/tw:variance` | Phase variance report — estimated vs actual, recommendations |

### Session Handoff

| Command | Description |
|---------|-------------|
| `/tw:done` | End session — generate 10-section handoff + paste-able resume prompt |
| `/tw:resume` | Load latest handoff, announce readiness to continue |
| `/tw:recover` | Restore context after a crash or unexpected session end |
| `/tw:handoff [list\|show N]` | List or view past handoff documents |

### Knowledge

| Command | Description |
|---------|-------------|
| `/tw:recall <query>` | Search journals, specs, handoffs, and project history |
| `/tw:specs [subcommand]` | Manage the spec library (list, show, search, add, edit, review) |
| `/tw:journal [subcommand]` | View or search session journals (30-day rolling window) |

### Configuration

| Command | Description |
|---------|-------------|
| `/tw:tier [set <tier>]` | View current tier, or change it |
| `/tw:status` | Full project status dashboard |

---

## 7. Skill Tier System

The skill tier controls how the AI communicates — not what it does, but how it explains it. Set at `threadwork init`. Change anytime with `/tw:tier set <tier>`.

### Tiers

| Tier | Best for | Behavior |
|------|----------|----------|
| `beginner` | Learning, onboarding | Step-by-step reasoning, inline code comments throughout, "what just happened" summaries, orientation blocks at phase transitions, explained token warnings |
| `advanced` | Most developers *(default)* | 1–2 sentence reasoning summaries, comments only for non-obvious logic, terse status updates, brief one-liner token warnings |
| `ninja` | Experienced, fast-paced | Code only, no narration, raw errors with minimal fix, machine-readable compact output, single indicator for warnings (e.g. `🚨 91%`) |

### How it works

The tier value from `project.json` is read by the `session-start` hook and the `pre-tool-use` hook. It's injected into every subagent prompt as an `## Output Style` block. Every command, every agent, every quality gate message adapts uniformly.

### Changing your tier

```
/tw:tier set beginner
/tw:tier set advanced
/tw:tier set ninja

# View current tier:
/tw:tier
```

The change takes effect immediately — the next subagent invocation picks it up.

---

## 8. Token Budget System

Claude models have a finite context window. Without tracking, you can silently run into the limit mid-task and lose progress. Threadwork makes token usage a first-class concern.

### How budgeting works

The session budget is set at `threadwork init` (default: 800K tokens, which is 80% of Sonnet's 1M context). Each completed task's token usage is recorded in `.threadwork/state/token-log.json`. Usage is estimated using a `chars / 4` heuristic — no API call required.

### Thresholds

| Usage | Status | Action |
|-------|--------|--------|
| < 80% | Healthy | Normal operation |
| ≥ 80% | Warning | Injected into next prompt: "consider wrapping up" |
| ≥ 90% | Critical | Stderr warning + visible in every output |
| ≥ 95% | Auto-handoff | Handoff generated even without running `/tw:done` |

### Commands

**Dashboard:**
```
/tw:budget
```
```
Token Budget — my-project
  Used:      312K / 800K (39%)
  Remaining: 488K
  Status:    ✅ Healthy
```

**Pre-task estimate:**
```
/tw:estimate add JWT refresh token rotation to the auth middleware
```
```
Task: "add JWT refresh token rotation to the auth middleware"
Complexity: medium
Estimated:  15K–40K tokens (midpoint: 27K)
Remaining:  488K
Verdict:    ✅ Safe to proceed
```

Verdict bands:
- `✅ Safe` — estimate well within budget
- `⚠️ Caution` — estimate pushes you past 80%
- `🚨 Risk` — estimate pushes you past 90%

**Full token log:**
```
/tw:tokens
```

**Variance report:**
```
/tw:variance
```

Shows estimated vs actual per task with accuracy ratings:
- **Excellent** — within 10% of estimate
- **Good** — within 20%
- **Needs Improvement** — over 20% off

Recommendations are generated to improve future estimates (e.g. "complex auth tasks consistently run 30% over — adjust your estimates upward").

### Complexity heuristics

The estimator classifies tasks by description:

| Complexity | Triggers | Range |
|------------|----------|-------|
| Simple | `add`, `fix`, `rename`, `remove` + short description | 5K–15K |
| Medium | Mixed signals, moderate description length | 15K–40K |
| Complex | `auth`, `migration`, `database`, `integration`, `refactor`, long descriptions | 40K–80K |

Planning phases (phase ≤ 1) apply a 0.7× multiplier — they're cheaper than execution.

---

## 9. Session Handoff System

The handoff system ensures you can always resume from exactly where you left off, even after a crash.

### Ending a session

```
/tw:done
```

This command:
1. Reads all session state files
2. Asks you to record any key decisions (optional)
3. Generates a 10-section handoff document at `.threadwork/workspace/handoffs/YYYY-MM-DD-N.md`
4. Writes a checkpoint to `.threadwork/state/checkpoint.json`
5. Prints a self-contained resume prompt to the terminal

### The 10-section handoff

| Section | Content |
|---------|---------|
| 1. Session Overview | Date, phase, milestone, estimated duration |
| 2. Completed This Session | Task IDs with one-line descriptions |
| 3. In Progress | Active task and completion percentage |
| 4. Key Decisions | Architectural and design decisions recorded |
| 5. Files Modified | From `git diff` since session start |
| 6. Token Usage | Used/budget/% + per-task table |
| 7. Git State | Branch, last commit SHA, uncommitted file count |
| 8. Quality Gate Status | Last Ralph Loop result |
| 9. Recommended Next Action | Single sentence — what to do first next session |
| 10. Resume Prompt | Self-contained paste-able block |

### The resume prompt

```
── THREADWORK RESUME ──────────────────────────────
Project: my-project | Phase: 2 | Milestone: 1
Last session: 2026-02-27 | Branch: feature/auth
Completed: T-2-1, T-2-2, T-2-3
In progress: T-2-4 — JWT refresh rotation (60%)
Next action: Complete T-2-4, then run /tw:verify-phase 2
Token budget remaining: 488K / 800K
Skill tier: advanced
─────────────────────────────────────────────────
Continue from where we left off. Load checkpoint
and resume task T-2-4.
```

Paste this as your first message in the next session. Everything needed to restore context is in this block — no file reading required.

### Resuming a session

```
/tw:resume
```

Reads the latest handoff, announces readiness, and restores the checkpoint state.

### Recovering after a crash

If a session ends unexpectedly (crash, timeout, manual close):

```
/tw:recover
```

Reads `.threadwork/state/checkpoint.json` and the latest handoff to reconstruct session context. Use this instead of `/tw:resume` when the session didn't end cleanly.

### Viewing past handoffs

```
/tw:handoff list        # show all handoffs with dates and phases
/tw:handoff show 3      # display the 3rd most recent handoff
```

---

## 10. Spec Library

Specs are the long-term memory of your project's conventions. They tell the AI how your project works — not what to build, but how to build it.

### What specs contain

Each spec is a markdown file with YAML frontmatter:

```markdown
---
title: API Design Patterns
tags: [backend, api, rest]
applies_to: [api routes, controllers, middleware]
---

# API Design Patterns

## Route Structure
All routes follow REST conventions...
```

Starter specs are installed at `threadwork init` across four categories:

| Category | Content |
|----------|---------|
| `frontend/react-patterns.md` | Component structure, hooks, state management |
| `frontend/styling.md` | CSS conventions, class naming, responsive patterns |
| `backend/api-design.md` | REST conventions, error formats, pagination |
| `backend/auth.md` | JWT with jose, httpOnly cookies, bcrypt ×12, refresh rotation |
| `testing/testing-standards.md` | Test file structure, coverage requirements, mocking strategy |

### How injection works

The `pre-tool-use` hook fires before every `Task()` call. It:

1. Reads all specs from `.threadwork/specs/`
2. Matches specs to the task by keyword overlap (task description vs spec `applies_to` and `tags`)
3. Builds an injection block capped at 8K tokens
4. Prepends it to the agent prompt

The agent never has to ask "what are our conventions?" — it just knows.

### Managing specs

```
/tw:specs list                     # show all specs with tags
/tw:specs show backend/api-design  # display a spec
/tw:specs search "authentication"  # find specs by content
/tw:specs add                      # interactively create a new spec
/tw:specs edit backend/auth        # edit an existing spec
/tw:specs review                   # review pending AI-proposed updates
```

### AI-proposed spec updates

When the `tw-spec-writer` agent notices a new pattern in your code that doesn't match any existing spec, it proposes a spec update using `proposeSpecUpdate()`. Proposals are stored in `.threadwork/specs/proposals/`.

Review and accept them with:

```
/tw:specs review
```

You approve or reject each proposal. Accepted proposals are merged into the relevant spec file.

---

## 11. Hook System

Threadwork registers four hooks into `~/.claude/settings.json`. They fire automatically — you don't invoke them manually.

### Hook 1: `session-start.js`

**Fires:** When Claude Code starts a session in your project.

**What it does:**
- Reads `project.json` and `token-log.json`
- Composes an orientation block with: project name, current phase/milestone/task, token budget dashboard, skill tier, checkpoint warning if an unfinished session was detected
- Injects this block as the first system message of the session

### Hook 2: `pre-tool-use.js`

**Fires:** Before every tool call where the tool name is `Task` or `task` (i.e., before spawning any subagent).

**What it does:**
- Reads relevant specs via the spec engine (8K limit)
- Reads current token budget
- Reads skill tier instructions
- Prepends a context block to the agent prompt

This is why every agent automatically follows your conventions and knows the budget state — they receive the context before they start.

### Hook 3: `post-tool-use.js`

**Fires:** After every tool call.

**What it does:**
- Estimates tokens used by the tool call and records them
- Detects learning signals (new patterns, convention deviations) and logs them
- Writes a checkpoint to `.threadwork/state/checkpoint.json` (async, deferred 100ms to avoid blocking)
- Logs to `.threadwork/workspace/hook-log.json` for debugging

### Hook 4: `subagent-stop.js` — The Ralph Loop

**Fires:** When a subagent completes (SubagentStop event).

**What it does:**
1. Reads the quality config from `.threadwork/state/quality-config.json`
2. Runs all enabled quality gates: typecheck → lint → tests → build → security scan
3. Gates are cached per git commit SHA — unchanged code is not re-run
4. **If gates pass:** records success, the subagent is done
5. **If gates fail:** generates a tier-appropriate correction prompt and re-runs the agent (up to 5 retries)
6. After 5 failed retries: escalates with an error message, marks the plan as FAILED

**Key guarantee:** All hooks catch errors and exit 0. Hooks never crash your session. Quality gate failures result in retry prompts, not session crashes.

### Codex compatibility

For Codex, hooks are not available. Instead, the equivalent behavioral instructions are injected into `AGENTS.md` at init time. Codex will follow these instructions as its system prompt. The spec library and state directory work identically.

### Testing hooks manually

```bash
# Simulate all hook events at all tiers and budget levels
node hooks/test-harness.js all

# Simulate a specific hook
node hooks/test-harness.js session-start --tier ninja
echo '{}' | node hooks/session-start.js
```

---

## 12. Agent Roster

Threadwork installs eight specialized agents into `~/.claude/agents/`. They are invoked automatically by commands — you don't call them directly in most cases.

| Agent | Model | Role |
|-------|-------|------|
| `tw-planner` | Opus | Generates XML execution plans with task IDs, dependencies, and per-task token estimates |
| `tw-researcher` | Opus | Domain research — library recommendations, API docs, pattern analysis |
| `tw-executor` | Sonnet | Implements tasks with atomic commits, spec compliance, quality gate adherence |
| `tw-verifier` | Sonnet | Goal-backward requirements verification — maps tasks to requirements, identifies gaps |
| `tw-plan-checker` | Sonnet | Validates plans across 6 quality dimensions before execution |
| `tw-debugger` | Opus | Hypothesis-driven debugging with systematic root cause identification |
| `tw-dispatch` | Haiku | Parallel work coordinator — orchestrates wave execution, manages task assignment |
| `tw-spec-writer` | Haiku | Detects patterns from completed tasks, proposes spec updates |

All agents receive:
- Skill tier instructions (via `pre-tool-use` hook)
- Token budget status (via `pre-tool-use` hook)
- Relevant specs (via `pre-tool-use` hook)
- A checkpoint protocol (save state before stopping)

---

## 13. Directory Structure

### Package structure (installed globally)

```
threadwork-cc/
├── bin/
│   └── threadwork.js          CLI entry point
├── hooks/
│   ├── session-start.js       Hook 1 — session init
│   ├── pre-tool-use.js        Hook 2 — spec + budget injection
│   ├── post-tool-use.js       Hook 3 — token tracking + checkpoint
│   ├── subagent-stop.js       Hook 4 — Ralph Loop quality gates
│   └── test-harness.js        Manual hook simulation
├── lib/
│   ├── runtime.js             Runtime detection (Claude Code vs Codex)
│   ├── state.js               State read/write, phase/task/checkpoint management
│   ├── token-tracker.js       Budget tracking, estimation, variance reporting
│   ├── skill-tier.js          Tier get/set, instruction generation, output formatting
│   ├── git.js                 Branch, commits, worktrees, atomic commit writes
│   ├── journal.js             Session journals (30-day rolling window)
│   ├── handoff.js             10-section handoff generation and parsing
│   ├── spec-engine.js         Spec parsing, relevance matching, injection building
│   └── quality-gate.js        Lint/typecheck/test/build/security runners, SHA caching
├── install/
│   ├── init.js                Interactive setup — 6 questions
│   ├── claude-code.js         Settings.json hook merge, commands + agents install
│   ├── codex.js               AGENTS.md injection
│   ├── update.js              Framework file updates (preserves user specs)
│   └── status.js              CLI status dashboard
├── templates/
│   ├── commands/              23 slash command markdown files
│   ├── agents/                8 agent definition files
│   ├── specs/                 Starter spec library
│   └── AGENTS.md              Project-level guide (installed as CLAUDE.md or AGENTS.md)
└── tests/
    ├── unit/                  Unit tests for lib/ modules
    └── integration/           Integration tests for hooks, install, handoff
```

### Per-project directory (created by `threadwork init`)

```
.threadwork/
├── state/
│   ├── project.json           Project config — name, stack, phase, tier, budget
│   ├── checkpoint.json        Current session checkpoint (written after every tool call)
│   ├── token-log.json         Session token usage + per-task breakdown
│   ├── quality-config.json    Gate thresholds — coverage %, lint level, enabled gates
│   ├── .gate-cache.json       Quality gate results cached per git SHA
│   └── phases/
│       └── phase-N/
│           ├── discussion.md  Notes from /tw:discuss-phase N
│           ├── plans/         PLAN-N-*.xml execution plans
│           ├── deps.json      Plan dependency graph
│           ├── execution-log.json  Wave execution results
│           └── verification.md    /tw:verify-phase N output
├── specs/
│   ├── frontend/              react-patterns.md, styling.md
│   ├── backend/               api-design.md, auth.md
│   ├── testing/               testing-standards.md
│   ├── proposals/             AI-proposed spec updates (pending review)
│   └── index.md               Spec index with tags and descriptions
└── workspace/
    ├── journals/              Session journals (one per session, 30-day window)
    ├── handoffs/              Session handoff documents (YYYY-MM-DD-N.md)
    └── archive/               Archived phase state
```

---

## 14. Configuration Reference

### `project.json`

```json
{
  "_version": "1",
  "_updated": "2026-02-27T12:00:00.000Z",
  "projectName": "my-project",
  "techStack": "Next.js + TypeScript",
  "currentPhase": 2,
  "currentMilestone": 1,
  "activeTask": "T-2-4",
  "skillTier": "advanced",
  "sessionBudget": 800000,
  "teamMode": "solo",
  "qualityConfig": {
    "minCoverage": 80,
    "lintLevel": "strict"
  }
}
```

### `quality-config.json`

```json
{
  "_version": "1",
  "typecheck": { "enabled": true, "blocking": true },
  "lint":      { "enabled": true, "blocking": true },
  "tests":     { "enabled": true, "blocking": true, "minCoverage": 80 },
  "build":     { "enabled": false, "blocking": false },
  "security":  { "enabled": true, "blocking": false }
}
```

**Notes:**
- `blocking: true` means a failure blocks agent completion (triggers Ralph Loop retry)
- `blocking: false` means a failure is logged but doesn't block
- `build` is disabled by default — enable it for production pipelines
- `security` is non-blocking by default — findings are reported but don't halt work
- Lint tool is auto-detected: `eslint` → `biome` → `oxlint` (first found wins)

### Skill tier

Set at init. Change with `/tw:tier set <tier>`. Stored in `project.json` as `skillTier`.

Valid values: `beginner`, `advanced`, `ninja`. Falls back to `advanced` if unset or invalid.

### Token budget

Set at init (in thousands). Stored in `token-log.json` as `sessionBudget` (in tokens, not thousands).

Thresholds are fixed at 80% (warning) and 90% (critical). The auto-handoff threshold is fixed at 95%.

### Updating framework files

After a `threadwork-cc` package update, update the framework files in your project (hooks, lib) while preserving your custom specs:

```bash
threadwork update
```

---

## 15. Starting from an Existing Blueprint

If you already have a requirements document, blueprint, or PRD before starting a Threadwork project, use the `--from-prd` flag to skip the interactive questions and let Threadwork read your document instead.

### Where to put your document

Place it anywhere in the project — the convention is `docs/`:

```
your-project/
├── docs/
│   ├── blueprint.md        ← your blueprint or PRD
│   └── requirements.md     ← optional separate requirements doc
└── ...
```

The file can be any name with any extension (`.md`, `.txt`, `.pdf`, `.docx`). It just needs to be readable from the project root.

### Procedure

**Step 1: Initialize Threadwork**

```bash
threadwork init
```

Answer the six setup questions (project name, stack, quality thresholds, team mode, skill tier, session budget). These configure the runtime — not the project requirements, which will come from your document.

**Step 2: Run `/tw:new-project --from-prd`**

```
/tw:new-project --from-prd docs/blueprint.md
```

This skips all seven clarifying questions and instead:

1. Reads your document
2. Spawns a `tw-researcher` agent to analyze the domain and identify patterns
3. Spawns a `tw-planner` agent to generate project files from your document's content

**Step 3: Review generated files**

Threadwork generates four files in `.threadwork/state/`:

| File | Contents |
|------|----------|
| `PROJECT.md` | Vision (2–3 sentences), core principles, confirmed tech stack, constraints |
| `REQUIREMENTS.md` | Functional requirements in REQ-001/REQ-002 format, non-functional requirements, explicitly out-of-scope items |
| `ROADMAP.md` | Milestone and phase breakdown derived from your document |
| `STATE.json` | Machine-readable project state |

Initial spec entries are also written to `.threadwork/specs/` based on stack decisions found in your document.

Review the generated files and correct anything that was misread. You can edit them directly — they're plain markdown.

**Step 4: Continue with the standard phase workflow**

```
/tw:discuss-phase 1     ← capture preferences before planning
/tw:plan-phase 1        ← generate XML execution plans
/tw:execute-phase 1     ← run parallel wave execution
/tw:verify-phase 1      ← verify output meets requirements
/tw:clear               ← close phase, advance to next
```

### What if my document is partial or informal?

`--from-prd` works with any level of detail. If your document is a rough outline or a one-page summary, the planner will ask clarifying questions about gaps before generating the roadmap. If your document is a formal specification, the planner will use it directly.

For very early-stage projects where no document exists yet, use `/tw:new-project` without `--from-prd` — the interactive questions produce the same output from scratch.

---

## 16. Troubleshooting

### Hooks not firing

1. Check that hooks are registered in `~/.claude/settings.json`:
   ```bash
   cat ~/.claude/settings.json | grep threadwork
   ```
2. Ensure you're in a project where `threadwork init` was run (`.threadwork/` exists)
3. Run the test harness to verify hooks work in isolation:
   ```bash
   node hooks/test-harness.js all
   node hooks/test-harness.js session-start
   ```

### Quality gates not running

1. Check `.threadwork/state/quality-config.json` — confirm the gates you expect are `"enabled": true`
2. The gate auto-detection requires the tool to be in your `PATH`. Verify:
   ```bash
   which eslint   # or biome, oxlint
   which tsc
   ```
3. If gates pass but still retry: check the SHA cache at `.threadwork/state/.gate-cache.json`. Delete it to force a fresh run.

### Token tracking seems off

Token estimation uses `chars / 4` — it's a heuristic, not an exact count. Large tool outputs (file reads, bash output) can add untracked tokens. The variance report (`/tw:variance`) will show where estimates diverge most.

### `threadwork init` fails or hangs

- Check Node.js version: `node --version` (requires ≥ 18)
- Try dry-run mode to isolate where it fails: `threadwork init --dry-run`
- Check write permissions in your project directory and `~/.claude/`

### Recovering from a crashed session

```
/tw:recover
```

This reads `.threadwork/state/checkpoint.json` written by the last `post-tool-use` hook. If the checkpoint is missing (crash before the first tool call), use `/tw:handoff show 1` to get the most recent handoff and manually restore context.

### Hooks log location

All hook output is logged to `.threadwork/workspace/hook-log.json`. Check this file if a hook seems to be misbehaving:

```bash
cat .threadwork/workspace/hook-log.json | tail -50
```

---

*Threadwork is MIT licensed. Issues and PRs welcome at [github.com/nexora/threadwork](https://github.com/nexora/threadwork).*
