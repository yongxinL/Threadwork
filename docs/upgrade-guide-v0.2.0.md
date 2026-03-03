# Threadwork v0.1.x → v0.2.0 Upgrade Guide

## What Changes and Why

v0.2.0 introduces five targeted upgrades to make your Threadwork sessions more efficient and knowledge-retaining. The changes are additive — nothing is removed, and all your existing project data is preserved.

### Research Foundation

Both upgrades are informed by two landmark articles:
- **LangChain** — "Frameworks, Runtimes, and Harnesses": formal taxonomy distinguishing agent frameworks, runtimes, and harnesses; transient vs persistent context; dynamic tool selection
- **OpenAI** — "Harness Engineering: Leveraging Codex in an Agent-First World": production experience building 1M LOC at 3.5 PRs/engineer/day using Codex + GPT-5; three patterns: remediation-injecting linters, progressive disclosure, background garbage collection

---

## Step-by-Step Migration

### Prerequisites

- Threadwork v0.1.x initialized (`threadwork init` completed, `.threadwork/` directory exists)
- Node.js ≥ 18
- `threadwork` CLI available (`npm link` or globally installed)

### Step 1: Run the migration command

```bash
cd /your/project
threadwork update --to v0.2.0
```

The command is **idempotent** — if it fails partway through, re-running it will skip already-completed steps and continue from where it stopped. It checks `_version` in `project.json` at the start: if already `"0.2.0"`, it exits immediately.

### Step 2: Verify the migration

```bash
cat .threadwork/state/project.json | grep _version
# → "_version": "0.2.0"

ls .threadwork/store/
# → edge-cases/  patterns/  conventions/  store-index.json
```

### Step 3: Generate spec IDs (if not auto-generated)

The routing map requires spec IDs (`SPEC:auth-001`, `SPEC:test-001`, etc.) in your spec files. The migration command runs `generateSpecIds()` automatically, but if your specs didn't get IDs, run:

```
/tw:specs reindex
```

This adds a `specId` frontmatter field to each spec that lacks one. Existing content is not changed.

### Step 4: Review entropy scanner settings (optional)

The entropy collector scans for 6 categories by default. If some don't apply to your project, disable them in `quality-config.json`:

```json
{
  "entropy": {
    "naming_drift": true,
    "import_boundaries": true,
    "orphaned_artifacts": true,
    "documentation_staleness": false,
    "inconsistent_error_handling": true,
    "duplicate_logic": false
  }
}
```

### Step 5: Confirm Store domain settings (optional)

The Store tracks three domains by default. If you want to restrict or add domains, update `project.json`:

```json
{
  "store_domains": ["patterns", "edge-cases", "conventions"]
}
```

### Step 6: Restart Claude Code

Hooks are loaded at session start. Restart your Claude Code session to load the updated hooks.

---

## What Is NOT Changed

| Item | Status |
|------|--------|
| `.threadwork/specs/` user-authored specs | **Preserved exactly** — only spec IDs are added as frontmatter |
| `.threadwork/workspace/journals/` | **Preserved exactly** |
| `.threadwork/workspace/handoffs/` | **Preserved exactly** |
| `.threadwork/state/phases/*/plans/*.xml` | **Preserved exactly** — no retroactive `<decisions>` blocks added |
| `project.json` fields other than `_version`, `store_enabled` | **Preserved exactly** |
| `settings.json` hook registrations | **Unchanged** — file paths don't change, only the scripts |

---

## What Each Upgrade Changes for Your Workflow

### Upgrade 1: Remediation-Injecting Ralph Loop

**Before**: When Ralph Loop catches an error, it re-invokes the agent with "Fix these errors: [raw output]".

**After**: Ralph Loop re-invokes with a structured remediation block:
```
QUALITY GATE REJECTION (iteration 2 of 5)
Primary violation: TypeScript type error in auth module
Relevant spec: backend/auth-patterns — Section: User type definition
Fix required: The User type lacks a 'token' field. Add 'token?: string' to src/types/user.ts.
```

**What you'll notice**: Agents fix errors more precisely on the first retry. Fewer Ralph Loop iterations overall.

### Upgrade 2: Progressive Disclosure Spec Injection

**Before**: On agent spawn, all relevant spec files are injected in full (~3K–8K tokens per spawn).

**After**: A compact routing map (~150 tokens) is injected. Agents call `spec_fetch SPEC:auth-001` to pull a specific spec when needed.

**What you'll notice**: Sessions run longer before hitting token limits. The `/tw:budget` dashboard now shows a `Spec fetches` line so you can see the overhead separately.

### Upgrade 3: Background Entropy Collector

**Before**: No automatic process to detect cross-task quality drift. "AI slop" accumulates silently.

**After**: After each wave completes, `tw-entropy-collector` (Haiku model, cheap) scans the wave's git diff. Minor issues (naming drift, orphaned files) are auto-fixed with `chore: [entropy-collector]` commits. Larger issues are queued for the next wave.

**What you'll notice**: Occasional `chore:` commits appearing in your git log after wave completion. Run `/tw:entropy` to see what was scanned and fixed.

### Upgrade 4: Cross-Session Memory Store

**Before**: Each project starts cold. Patterns learned in one project don't carry over.

**After**: `~/.threadwork/store/` accumulates patterns and edge cases across all projects. Session start injects the top 3 most relevant Store entries. High-confidence spec proposals are auto-promoted to the Store.

**What you'll notice**: New projects get relevant knowledge from day one. Run `/tw:store` to browse accumulated entries.

### Upgrade 5: Execution Plan Decision Logs

**Before**: Executor agents write SUMMARY.md after completion. Architectural choices made during implementation are lost unless manually captured.

**After**: Executor agents append `<decisions>` blocks to the plan XML as they work. The handoff Section 4 (Key Decisions) is auto-populated from these blocks.

**What you'll notice**: Handoffs now have detailed architectural rationale. When debugging or reviewing a session, you can see _why_ choices were made directly in the plan XML.

---

## Rollback

If you need to revert to v0.1.x behavior:

1. **Restore backed-up hooks**:
   ```bash
   cp .threadwork/backup/v0.1.x-hooks/*.js .threadwork/hooks/
   ```

2. **Revert project.json**:
   ```bash
   # Edit .threadwork/state/project.json — set "_version" back to "1"
   # Remove "store_enabled" and "store_domains" fields
   ```

3. **Restart Claude Code** to reload the restored hooks.

The `.threadwork/store/` directory can be left in place — v0.1.x hooks don't read it, so it's harmless. Your specs, journals, handoffs, and plans are unchanged throughout.

---

## Troubleshooting

### "Already at v0.2.0" but hooks aren't working

The idempotency check only looks at `_version`. If you need to re-run framework file updates:

```bash
# Force re-copy of all framework files without the migration patches
threadwork update
```

### Spec IDs aren't appearing in the routing map

The routing map uses `specId` frontmatter. Check that your specs have it:

```bash
grep -r "specId:" .threadwork/specs/
```

If missing, run `/tw:specs reindex` or add IDs manually:
```yaml
---
title: Auth Patterns
specId: SPEC:auth-001
tags: [auth, jwt]
---
```

### Store entries not appearing at session start

The Store injection is skipped when token budget is >80% used. If your budget resets between sessions, the injection will resume. Also check that `~/.threadwork/store/store-index.json` has `entries` with `confidence >= 0.5`.

### entropy-collector not triggering

The entropy collector fires when `isWaveComplete()` returns true — when all tasks in `execution-log.json` have status `DONE` or `SKIPPED`. If tasks are stalling at other statuses, check the execution log.

---

## New Commands Reference

| Command | Description |
|---------|-------------|
| `threadwork update --to v0.2.0` | Run the v0.2.0 migration (idempotent) |
| `/tw:entropy` | Show latest entropy report |
| `/tw:entropy history` | List all entropy reports |
| `/tw:entropy show <N>` | Show entropy report for wave N |
| `/tw:store` | Store dashboard |
| `/tw:store list` | List all Store entries |
| `/tw:store show <key>` | Show a specific entry |
| `/tw:store promote <id>` | Manually promote a proposal |
| `/tw:store prune` | Remove low-confidence entries |
