# Threadwork

**Production-grade AI coding workflow tool for Claude Code and Codex.**

Threadwork weaves tasks, specs, and sessions into a single thread. It combines spec-driven project orchestration (from [GSD](https://github.com/gsd-build/get-shit-done)) with hook-enforced spec injection and automated quality gates (from [Trellis](https://github.com/mindfold-ai/Trellis)), and adds first-class **token budgeting**, **structured session handoffs**, and **skill-tier-aware output**.

---

## Quick Start

```bash
# 1. Install globally
npx threadwork-cc@latest

# 2. In your project directory
threadwork init
#   → Asks 6 questions (name, stack, quality thresholds, team mode, skill tier, session budget)
#   → Scaffolds .threadwork/, registers 4 hooks, installs commands and agents

# 3. Start Claude Code in your project
# In Claude Code:
/tw:new-project
/tw:plan-phase 1
/tw:execute-phase 1
/tw:done
```

---

## Install from Repository

Use this if you want to run from source, contribute, or test before publishing.

### Prerequisites

- **Node.js ≥ 18** (Node 22 LTS recommended)
- **npm ≥ 10**

```bash
# Verify
node --version   # v22.x.x
npm --version    # 10.x.x
```

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/nexora/threadwork.git
cd threadwork

# 2. Install dependencies
npm install

# 3. Verify everything passes
npm run check        # syntax check all JS files
npm test             # unit tests (40 tests)
npm run test:all     # unit + integration tests (78 tests)

# 4. Test hooks manually
node hooks/test-harness.js all

# 5. Link globally so the `threadwork` command is available
npm link

# 6. Confirm the CLI is working
threadwork --version
```

### Use in a project

```bash
cd /your/project
threadwork init
```

### Unlink when done

```bash
npm unlink -g threadwork-cc
```

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Hook-driven context** | 4 hooks inject specs, tier instructions, and token budget into every agent automatically |
| **Ralph Loop** | SubagentStop hook runs lint/typecheck/tests after every subagent — blocks completion until gates pass |
| **Token budgeting** | Tracks usage, warns at 80%/90%, shows variance vs estimates per task |
| **Session handoffs** | `/tw:done` generates a 10-section handoff with a paste-able resume prompt |
| **Skill tiers** | `beginner` / `advanced` / `ninja` — controls verbosity across all outputs uniformly |
| **Spec library** | Growing library of patterns injected per-task. AI proposes updates; you approve them |
| **Parallel execution** | Wave-based parallel subagent execution with topological dependency ordering |
| **Brownfield support** | `/tw:analyze-codebase` maps existing projects and generates starter specs |

---

## Slash Commands

### Project Setup
```
/tw:new-project           7 clarifying questions → PROJECT.md + REQUIREMENTS.md + ROADMAP.md
/tw:analyze-codebase      Map brownfield project → detect framework, generate starter specs
```

### Phase Workflow
```
/tw:discuss-phase <N>     Capture library/pattern decisions before planning
/tw:plan-phase <N>        Generate XML plans with token estimates + phase budget preview
/tw:execute-phase <N>     Parallel wave execution with spec injection + Ralph Loop
/tw:verify-phase <N>      Goal-backward verification + token variance report
/tw:clear                 Close phase, advance to next
/tw:audit-milestone <N>   Cross-phase milestone verification
```

### Task Execution
```
/tw:quick <desc>          Fast-path task — shows estimate, executes, commits
/tw:parallel <desc>       Isolated worktree execution → draft PR
```

### Token Budget
```
/tw:budget                Session budget dashboard
/tw:estimate <desc>       Token estimate before committing to a task
/tw:tokens                Full session token log
/tw:variance              Phase variance report (estimated vs actual per task)
```

### Session Handoff
```
/tw:done                  End session — generate 10-section handoff + resume prompt
/tw:handoff [list|show N] Manage past handoffs
/tw:resume                Load latest handoff, announce readiness
/tw:recover               Restore from checkpoint after crash
```

### Knowledge
```
/tw:recall <query>        Search journals, specs, handoffs, history
/tw:specs [subcommand]    Manage spec library
/tw:journal [subcommand]  View/search session journals
```

### Configuration
```
/tw:tier [set <tier>]     View or change skill tier
/tw:status                Full project status dashboard
```

---

## Hook Architecture

Threadwork registers 4 hooks into `~/.claude/settings.json`:

```
SessionStart   → session-start.js   Injects project context, budget, tier
PreToolUse     → pre-tool-use.js    Injects specs + tier into every Task() call
PostToolUse    → post-tool-use.js   Tracks tokens, detects patterns, writes checkpoint
SubagentStop   → subagent-stop.js   Ralph Loop — quality gates block completion
```

**Hooks never crash sessions.** All hooks catch errors and exit 0 — quality failures result in retry messages, not session crashes.

For Codex: equivalent behavioral instructions are injected into `AGENTS.md`.

---

## Skill Tier System

Set at `threadwork init`. Change with `/tw:tier set <tier>`.

| Tier | Description |
|------|-------------|
| `beginner` | Step-by-step explanations, inline comments in all generated code, "you are here" orientation |
| `advanced` | Concise summaries, comments for non-obvious logic only, terse status updates *(default)* |
| `ninja` | Code only, no narration, raw error output, single emoji warnings |

The tier is injected into every subagent prompt — it applies uniformly across all commands and agents.

---

## Token Budget System

Default budget: 800K tokens (80% of Sonnet's 1M context). Configurable at init.

```
< 80%  ✅ Healthy — normal operation
≥ 80%  ⚠️ Warning — injected into next prompt ("consider wrapping up")
≥ 90%  🚨 Critical — stderr warning + visible in every output
≥ 95%  Auto-generates handoff even without /tw:done
```

```
/tw:budget     — current dashboard
/tw:estimate   — pre-task estimate (verdict: ✅ Safe / ⚠️ Caution / 🚨 Risk)
/tw:tokens     — full log with variance per task
/tw:variance   — phase-level variance with improvement recommendations
```

---

## Session Handoff Workflow

Threadwork guarantees you can always resume from exactly where you left off.

```
# End of session:
/tw:done
# → Generates .threadwork/workspace/handoffs/YYYY-MM-DD-N.md
# → Prints resume prompt to terminal — paste it as your first message next session

# Start of next session:
/tw:resume
# → "Phase 2 | Task T-2-1-3 | Branch feature/auth | 488K tokens remaining. Ready."
```

The **10-section handoff** includes:
1. Session Overview
2. Completed Tasks
3. In Progress
4. Key Decisions
5. Files Modified
6. Token Usage
7. Git State
8. Quality Gate Status
9. Recommended Next Action
10. Self-contained Resume Prompt

The resume prompt contains everything needed to restore context — no file reading required.

---

## Directory Structure

```
.threadwork/
├── state/              project.json, checkpoint.json, token-log.json, quality-config.json
│   └── phases/         per-phase context, plans, verification, execution logs
├── specs/              spec library — frontend, backend, testing, proposals
└── workspace/          journals, handoffs, archive
```

---

## Agent Roster

| Agent | Model | Role |
|-------|-------|------|
| `tw-planner` | Opus | Generates XML plans with token estimates |
| `tw-researcher` | Opus | Domain research and library recommendations |
| `tw-executor` | Sonnet | Implements tasks with atomic commits |
| `tw-verifier` | Sonnet | Goal-backward requirements verification |
| `tw-plan-checker` | Sonnet | Validates plans across 6 quality dimensions |
| `tw-debugger` | Opus | Hypothesis-driven debugging |
| `tw-dispatch` | Haiku | Parallel work coordinator |
| `tw-spec-writer` | Haiku | Writes spec entries from detected patterns |

All agents receive skill tier instructions and token budget status automatically via the pre-tool-use hook.

---

## Combining With GSD / Trellis

Threadwork is compatible with projects using either GSD or Trellis:

- **From GSD**: Threadwork uses `.threadwork/state/` instead of `.planning/`. A `.planning/` alias is kept for gradual migration. Plan XML format is compatible.
- **From Trellis**: Threadwork's spec library format is identical to Trellis. Your existing specs in `.trellis/spec/` can be copied to `.threadwork/specs/`.

---

## Development

```bash
npm install
npm test          # unit tests
npm run test:all  # unit + integration tests
npm run check     # syntax check all JS files

# Test hooks manually
node hooks/test-harness.js all
node hooks/test-harness.js session-start --tier ninja
echo '{}' | node hooks/session-start.js
```

---

## Contributing

Issues and PRs welcome at [github.com/nexora/threadwork](https://github.com/nexora/threadwork).

---

## License

MIT — see [LICENSE](LICENSE).
