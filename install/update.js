/**
 * install/update.js — threadwork update command
 *
 * Updates framework files without overwriting user-customized specs or state.
 * With --to v0.2.0: runs the targeted v0.2.0 migration (idempotent).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runUpdate(options) {
  const cwd = process.cwd();
  const isDryRun = options.dryRun;
  const targetVersion = options.to;
  const stateDir = join(cwd, '.threadwork', 'state');

  if (!existsSync(stateDir)) {
    console.error("Threadwork is not initialized here. Run 'threadwork init' first.");
    process.exit(1);
  }

  if (targetVersion === 'v0.2.0') {
    return runMigrateV020({ cwd, stateDir, isDryRun });
  }

  if (targetVersion === 'v0.3.0') {
    return runMigrateV030({ cwd, stateDir, isDryRun });
  }

  // ── Standard update (no version target) ─────────────────────────────────────
  console.log('\n── Threadwork Update ─────────────────────────────');
  if (isDryRun) console.log('DRY RUN — no changes will be applied\n');

  const changes = await collectFrameworkUpdates(cwd, isDryRun);

  if (changes.length === 0) {
    console.log('Nothing to update.');
  } else {
    console.log('Changes:');
    for (const c of changes) console.log(c);
  }

  if (!isDryRun) {
    // Stamp _frameworkUpdatedAt in project.json
    try {
      const projectPath = join(stateDir, 'project.json');
      const proj = JSON.parse(readFileSync(projectPath, 'utf8'));
      proj._updated = new Date().toISOString();
      proj._frameworkUpdatedAt = new Date().toISOString();
      writeFileSync(projectPath, JSON.stringify(proj, null, 2));
    } catch { /* ignore */ }
    console.log('\n✅ Update complete.');
  } else {
    console.log('\nDRY RUN — no changes applied.');
  }
}

// ── v0.2.0 Migration ──────────────────────────────────────────────────────────

/**
 * Idempotent v0.1.x → v0.2.0 migration.
 * Safe to run multiple times — checks _version before each step.
 */
async function runMigrateV020({ cwd, stateDir, isDryRun }) {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Threadwork — Migrate to v0.2.0             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  if (isDryRun) console.log('DRY RUN — no changes will be applied\n');

  // ── Idempotency check ──────────────────────────────────────────────────────
  const projectPath = join(stateDir, 'project.json');
  let proj = {};
  try {
    proj = JSON.parse(readFileSync(projectPath, 'utf8'));
  } catch { /* project.json may not exist */ }

  if (proj._version === '0.2.0') {
    console.log('✅ Already at v0.2.0 — nothing to do.');
    return;
  }

  const applied = [];
  const skipped = [];

  // ── Step 1: Backup existing hooks ─────────────────────────────────────────
  const hooksDir = join(cwd, '.threadwork', 'hooks');
  const backupDir = join(cwd, '.threadwork', 'backup', 'v0.1.x-hooks');
  if (existsSync(hooksDir)) {
    applied.push('  [1] Backed up hooks/ → .threadwork/backup/v0.1.x-hooks/');
    if (!isDryRun) {
      mkdirSync(backupDir, { recursive: true });
      cpSync(hooksDir, backupDir, { recursive: true });
    }
  } else {
    skipped.push('  [1] Hooks backup skipped (.threadwork/hooks/ not found)');
  }

  // ── Steps 2–5: Replace hooks ───────────────────────────────────────────────
  const hooksSourceDir = join(__dirname, '..', 'hooks');
  const hookFiles = ['subagent-stop.js', 'pre-tool-use.js', 'post-tool-use.js', 'session-start.js'];
  if (existsSync(hooksSourceDir) && existsSync(hooksDir)) {
    for (const file of hookFiles) {
      const src = join(hooksSourceDir, file);
      if (existsSync(src)) {
        applied.push(`  [2–5] Replaced .threadwork/hooks/${file}`);
        if (!isDryRun) cpSync(src, join(hooksDir, file));
      }
    }
  } else {
    skipped.push('  [2–5] Hook replacement skipped (source or dest dir missing)');
  }

  // ── Steps 6–10: Update lib/ ───────────────────────────────────────────────
  const libSourceDir = join(__dirname, '..', 'lib');
  const libDestDir = join(cwd, '.threadwork', 'lib');
  if (existsSync(libSourceDir)) {
    applied.push('  [6–10] Updated .threadwork/lib/ (store.js, spec-engine.js, quality-gate.js, state.js, handoff.js)');
    if (!isDryRun) {
      mkdirSync(libDestDir, { recursive: true });
      cpSync(libSourceDir, libDestDir, { recursive: true });
    }
  } else {
    skipped.push('  [6–10] lib/ update skipped (source not found)');
  }

  // ── Step 11: Install/update agent templates ───────────────────────────────
  const { getCommandsDir, detectRuntime } = await import('../lib/runtime.js');
  const runtime = detectRuntime();
  const agentsSourceDir = join(__dirname, '..', 'templates', 'agents');
  const agentsDest = join(getCommandsDir(runtime).replace('/commands', '/agents'));
  if (existsSync(agentsSourceDir)) {
    const agentFiles = ['tw-entropy-collector.md', 'tw-executor.md'];
    mkdirSync(agentsDest, { recursive: true });
    for (const f of agentFiles) {
      const src = join(agentsSourceDir, f);
      if (existsSync(src)) {
        applied.push(`  [11] Installed/updated agent: ${f}`);
        if (!isDryRun) cpSync(src, join(agentsDest, f));
      }
    }
  }

  // ── Step 12: Install new slash commands ───────────────────────────────────
  const commandsSrcDir = join(__dirname, '..', 'templates', 'commands');
  const commandsDest = getCommandsDir(runtime);
  const newCommands = ['tw-entropy.md', 'tw-store.md'];
  if (existsSync(commandsSrcDir)) {
    mkdirSync(commandsDest, { recursive: true });
    for (const f of newCommands) {
      const src = join(commandsSrcDir, f);
      if (existsSync(src)) {
        applied.push(`  [12] Installed new command: ${f}`);
        if (!isDryRun) cpSync(src, join(commandsDest, f));
      }
    }
  }

  // ── Step 13: Create .threadwork/store/ ────────────────────────────────────
  const storeDir = join(cwd, '.threadwork', 'store');
  const storeIndexPath = join(storeDir, 'store-index.json');
  if (!existsSync(storeDir)) {
    applied.push('  [13] Created .threadwork/store/ (patterns/, edge-cases/, conventions/)');
    if (!isDryRun) {
      mkdirSync(join(storeDir, 'patterns'), { recursive: true });
      mkdirSync(join(storeDir, 'edge-cases'), { recursive: true });
      mkdirSync(join(storeDir, 'conventions'), { recursive: true });
      writeFileSync(storeIndexPath, JSON.stringify({
        _version: '0.2.0',
        _created: new Date().toISOString(),
        entries: []
      }, null, 2));
    }
  } else {
    skipped.push('  [13] .threadwork/store/ already exists — preserved');
  }

  // ── Step 14: Patch project.json ───────────────────────────────────────────
  applied.push('  [14] Updated project.json: _version → "0.2.0", store_enabled → true');
  if (!isDryRun) {
    proj._version = '0.2.0';
    proj._updated = new Date().toISOString();
    proj._frameworkUpdatedAt = new Date().toISOString();
    proj.store_enabled = true;
    if (!proj.store_domains) {
      proj.store_domains = ['patterns', 'edge-cases', 'conventions'];
    }
    writeFileSync(projectPath, JSON.stringify(proj, null, 2));
  }

  // ── Step 15: Patch token-log.json ─────────────────────────────────────────
  const tokenLogPath = join(stateDir, 'token-log.json');
  if (existsSync(tokenLogPath)) {
    try {
      const tokenLog = JSON.parse(readFileSync(tokenLogPath, 'utf8'));
      if (!('spec_fetch_tokens' in tokenLog)) {
        applied.push('  [15] Patched token-log.json: added spec_fetch_tokens: 0');
        if (!isDryRun) {
          tokenLog.spec_fetch_tokens = 0;
          tokenLog.spec_fetch_log = [];
          tokenLog._updated = new Date().toISOString();
          writeFileSync(tokenLogPath, JSON.stringify(tokenLog, null, 2));
        }
      } else {
        skipped.push('  [15] token-log.json already has spec_fetch_tokens');
      }
    } catch { skipped.push('  [15] token-log.json patch skipped (parse error)'); }
  } else {
    skipped.push('  [15] token-log.json not found — skipped');
  }

  // ── Step 16: Patch ralph-state.json ──────────────────────────────────────
  const ralphStatePath = join(stateDir, 'ralph-state.json');
  if (existsSync(ralphStatePath)) {
    try {
      const ralphState = JSON.parse(readFileSync(ralphStatePath, 'utf8'));
      if (!('remediation_log' in ralphState)) {
        applied.push('  [16] Patched ralph-state.json: added remediation_log: []');
        if (!isDryRun) {
          ralphState.remediation_log = [];
          ralphState._updated = new Date().toISOString();
          writeFileSync(ralphStatePath, JSON.stringify(ralphState, null, 2));
        }
      } else {
        skipped.push('  [16] ralph-state.json already has remediation_log');
      }
    } catch { skipped.push('  [16] ralph-state.json patch skipped (parse error)'); }
  } else {
    skipped.push('  [16] ralph-state.json not found — skipped');
  }

  // ── Step 17: Generate spec IDs ────────────────────────────────────────────
  const specsDir = join(cwd, '.threadwork', 'specs');
  if (existsSync(specsDir)) {
    try {
      const { generateSpecIds } = await import('../lib/spec-engine.js');
      const count = generateSpecIds();
      if (count > 0) {
        applied.push(`  [17] Generated ${count} spec IDs in specs/index.md`);
      } else {
        skipped.push('  [17] Spec IDs already generated (or no specs found)');
      }
    } catch { skipped.push('  [17] Spec ID generation skipped (spec-engine unavailable)'); }
  } else {
    skipped.push('  [17] .threadwork/specs/ not found — spec IDs skipped');
  }

  // ── Step 18: Print summary ────────────────────────────────────────────────
  console.log('Applied:');
  for (const line of applied) console.log(line);
  if (skipped.length > 0) {
    console.log('\nSkipped (already current or not applicable):');
    for (const line of skipped) console.log(line);
  }

  if (!isDryRun) {
    console.log('\n✅ Migration to v0.2.0 complete!\n');
    console.log('Next steps:');
    console.log('  1. Review .threadwork/specs/ — run /tw:specs reindex if spec IDs are missing');
    console.log('  2. Check quality-config.json entropy scanner categories');
    console.log('  3. Confirm store_domains in .threadwork/state/project.json');
    console.log('  4. Restart Claude Code to load updated hooks\n');
  } else {
    console.log('\nDRY RUN — no changes applied.');
  }
}

// ── v0.3.0 Migration ──────────────────────────────────────────────────────────

/**
 * Idempotent v0.2.x → v0.3.0 migration.
 * Safe to run multiple times — checks _version before each step.
 */
async function runMigrateV030({ cwd, stateDir, isDryRun }) {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Threadwork — Migrate to v0.3.0             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  if (isDryRun) console.log('DRY RUN — no changes will be applied\n');

  const { homedir } = await import('os');
  const projectPath = join(stateDir, 'project.json');
  let proj = {};
  try {
    proj = JSON.parse(readFileSync(projectPath, 'utf8'));
  } catch { /* project.json may not exist */ }

  if (proj._version === '0.3.0') {
    console.log('✅ Already at v0.3.0 — nothing to do.');
    return;
  }

  const applied = [];
  const skipped = [];

  // ── Step 1: Backup existing hooks ─────────────────────────────────────────
  const hooksDir = join(cwd, '.threadwork', 'hooks');
  const backupDir = join(cwd, '.threadwork', 'backup', 'v0.2.x-hooks');
  if (existsSync(hooksDir)) {
    applied.push('  [1] Backed up hooks/ → .threadwork/backup/v0.2.x-hooks/');
    if (!isDryRun) {
      mkdirSync(backupDir, { recursive: true });
      cpSync(hooksDir, backupDir, { recursive: true });
    }
  } else {
    skipped.push('  [1] Hooks backup skipped (.threadwork/hooks/ not found)');
  }

  // ── Step 2: Append .gitignore block (idempotent) ──────────────────────────
  const { writeGitignoreBlock } = await import('./claude-code.js');
  applied.push('  [2] Appending Threadwork block to .gitignore (idempotent)');
  if (!isDryRun) {
    try {
      writeGitignoreBlock(cwd);
    } catch { skipped.push('  [2] .gitignore write failed'); }
  }

  // ── Step 3: Create ~/.threadwork/pricing.json if absent ──────────────────
  const pricingPath = join(homedir(), '.threadwork', 'pricing.json');
  if (!existsSync(pricingPath)) {
    applied.push(`  [3] Creating ${pricingPath}`);
    if (!isDryRun) {
      mkdirSync(join(homedir(), '.threadwork'), { recursive: true });
      const pricingTemplate = join(__dirname, '..', 'templates', 'pricing.json');
      if (existsSync(pricingTemplate)) {
        cpSync(pricingTemplate, pricingPath);
      } else {
        writeFileSync(pricingPath, JSON.stringify({
          _updated: new Date().toISOString().slice(0, 10),
          _note: 'Prices per million tokens. Edit this file when Anthropic updates pricing.',
          models: {
            haiku: { input: 0.80, output: 4.00 },
            sonnet: { input: 3.00, output: 15.00 },
            opus: { input: 15.00, output: 75.00 }
          }
        }, null, 2), 'utf8');
      }
    }
  } else {
    skipped.push(`  [3] ${pricingPath} already exists — preserved`);
  }

  // ── Step 4: Update hooks/ ─────────────────────────────────────────────────
  const hooksSourceDir = join(__dirname, '..', 'hooks');
  const hookFiles = ['pre-tool-use.js', 'session-start.js', 'post-tool-use.js', 'subagent-stop.js'];
  if (existsSync(hooksSourceDir) && existsSync(hooksDir)) {
    for (const file of hookFiles) {
      const src = join(hooksSourceDir, file);
      if (existsSync(src)) {
        applied.push(`  [4] Updated .threadwork/hooks/${file}`);
        if (!isDryRun) cpSync(src, join(hooksDir, file));
      }
    }
  } else {
    skipped.push('  [4] Hook update skipped (source or dest dir missing)');
  }

  // ── Step 5: Update lib/ with new modules ─────────────────────────────────
  const libSourceDir = join(__dirname, '..', 'lib');
  const libDestDir = join(cwd, '.threadwork', 'lib');
  if (existsSync(libSourceDir)) {
    applied.push('  [5] Updated .threadwork/lib/ (token-tracker.js, model-switcher.js, blueprint-diff.js, handoff.js)');
    if (!isDryRun) {
      mkdirSync(libDestDir, { recursive: true });
      cpSync(libSourceDir, libDestDir, { recursive: true });
    }
  } else {
    skipped.push('  [5] lib/ update skipped');
  }

  // ── Step 6: Install new slash commands ────────────────────────────────────
  const { getCommandsDir, detectRuntime } = await import('../lib/runtime.js');
  const runtime = detectRuntime();
  const commandsSrcDir = join(__dirname, '..', 'templates', 'commands');
  const commandsDest = getCommandsDir(runtime);
  const newCommands = ['tw-cost.md', 'tw-model.md', 'tw-blueprint-diff.md', 'tw-blueprint-lock.md'];
  if (existsSync(commandsSrcDir)) {
    mkdirSync(commandsDest, { recursive: true });
    for (const f of newCommands) {
      const src = join(commandsSrcDir, f);
      if (existsSync(src)) {
        applied.push(`  [6] Installed command: ${f}`);
        if (!isDryRun) cpSync(src, join(commandsDest, f.replace(/^tw-/, '')));
      }
    }
  }

  // ── Step 7: Patch project.json with v0.3.0 fields ────────────────────────
  applied.push('  [7] Patching project.json with v0.3.0 fields');
  if (!isDryRun) {
    // Recalibrate session_token_budget if it's 800K and default_context is 200k
    let budgetNote = '';
    if (!proj.default_context) {
      proj.default_context = '200k';
    }
    if (!proj.cost_budget) {
      proj.cost_budget = 5.00;
    }
    if (!proj.model_switch_policy) {
      proj.model_switch_policy = 'notify';
    }
    if (!proj.session_token_budget) {
      proj.session_token_budget = proj.sessionBudget ?? 400_000;
    }
    // Recalibrate: if budget is 800K and context is 200k, recalibrate to 400K
    if ((proj.sessionBudget === 800_000 || proj.session_token_budget === 800_000) &&
        proj.default_context === '200k') {
      proj.session_token_budget = 400_000;
      proj.sessionBudget = 400_000;
      budgetNote = ' (recalibrated from 800K to 400K for 200K context model)';
    }
    proj._version = '0.3.0';
    proj._updated = new Date().toISOString();
    writeFileSync(projectPath, JSON.stringify(proj, null, 2));
    if (budgetNote) applied.push(`  [7b] Token budget recalibrated: 800K → 400K (200K context model)`);
  }

  // ── Step 8: Create .threadwork/workspace/sessions/ ───────────────────────
  const sessionsDir = join(cwd, '.threadwork', 'workspace', 'sessions');
  if (!existsSync(sessionsDir)) {
    applied.push('  [8] Created .threadwork/workspace/sessions/');
    if (!isDryRun) mkdirSync(sessionsDir, { recursive: true });
  } else {
    skipped.push('  [8] sessions/ already exists');
  }

  // ── Step 9: Update token-log.json with cost fields ───────────────────────
  const tokenLogPath = join(stateDir, 'token-log.json');
  if (existsSync(tokenLogPath)) {
    try {
      const tokenLog = JSON.parse(readFileSync(tokenLogPath, 'utf8'));
      if (!('sessionCostUsed' in tokenLog)) {
        applied.push('  [9] Patched token-log.json: added sessionCostUsed: 0');
        if (!isDryRun) {
          tokenLog.sessionCostUsed = 0;
          tokenLog._updated = new Date().toISOString();
          writeFileSync(tokenLogPath, JSON.stringify(tokenLog, null, 2));
        }
      } else {
        skipped.push('  [9] token-log.json already has sessionCostUsed');
      }
    } catch { skipped.push('  [9] token-log.json patch skipped (parse error)'); }
  } else {
    skipped.push('  [9] token-log.json not found — skipped');
  }

  // ── Step 10: Add model-switch-log.json to .gitignore ──────────────────────
  // Already handled by writeGitignoreBlock() in step 2 — no extra action needed
  skipped.push('  [10] model-switch-log.json excluded via .gitignore (handled in step 2)');

  // ── Step 11: Update THREADWORK.md with new commands ───────────────────────
  const threadworkMdPath = join(cwd, 'THREADWORK.md');
  if (!existsSync(threadworkMdPath)) {
    skipped.push('  [11] THREADWORK.md not found — skipped');
  } else {
    applied.push('  [11] THREADWORK.md commands section will be updated at next /tw:new-project');
    // Actual update deferred — THREADWORK.md is a user document
  }

  // ── Step 12: Print summary ────────────────────────────────────────────────
  console.log('Applied:');
  for (const line of applied) console.log(line);
  if (skipped.length > 0) {
    console.log('\nSkipped (already current or not applicable):');
    for (const line of skipped) console.log(line);
  }

  if (!isDryRun) {
    console.log('\n✅ Migration to v0.3.0 complete!\n');
    console.log('Next steps:');
    console.log('  1. Run /tw:blueprint-lock to establish your first blueprint baseline');
    console.log('  2. Review ~/.threadwork/pricing.json and update model prices if needed');
    console.log('  3. Review the new model_switch_policy setting in project.json');
    console.log('  4. Restart Claude Code to load updated hooks\n');
  } else {
    console.log('\nDRY RUN — no changes applied.');
  }
}

// ── Shared: collect standard framework file updates ───────────────────────────

async function collectFrameworkUpdates(cwd, isDryRun) {
  const changes = [];
  const { homedir } = await import('os');

  // Idempotently add git permissions to project-level .claude/settings.json
  const projectSettingsPath = join(cwd, '.claude', 'settings.json');
  let projectSettings = {};
  if (existsSync(projectSettingsPath)) {
    try { projectSettings = JSON.parse(readFileSync(projectSettingsPath, 'utf8')); } catch { /* create fresh */ }
  }
  const THREADWORK_PERMISSIONS = ['Bash(git:*)', 'Bash(node:*)'];
  projectSettings.permissions = projectSettings.permissions ?? {};
  projectSettings.permissions.allow = projectSettings.permissions.allow ?? [];
  const missing = THREADWORK_PERMISSIONS.filter(p => !projectSettings.permissions.allow.includes(p));
  if (missing.length > 0) {
    projectSettings.permissions.allow.push(...missing);
    changes.push(`  .claude/settings.json — git auto-approval added (${missing.join(', ')})`);
    if (!isDryRun) {
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      writeFileSync(projectSettingsPath, JSON.stringify(projectSettings, null, 2), 'utf8');
    }
  }

  // Refresh ~/.threadwork/pricing.json with latest template prices
  const pricingTemplate = join(__dirname, '..', 'templates', 'pricing.json');
  const pricingDest = join(homedir(), '.threadwork', 'pricing.json');
  if (existsSync(pricingTemplate)) {
    changes.push('  ~/.threadwork/pricing.json — refreshed with latest model prices');
    if (!isDryRun) {
      mkdirSync(join(homedir(), '.threadwork'), { recursive: true });
      cpSync(pricingTemplate, pricingDest);
    }
  }

  // Update hooks
  const hooksSourceDir = join(__dirname, '..', 'hooks');
  const hooksDestDir = join(cwd, '.threadwork', 'hooks');
  if (existsSync(hooksSourceDir)) {
    for (const file of readdirSync(hooksSourceDir)) {
      if (file.endsWith('.js') && file !== 'test-harness.js') {
        const dest = join(hooksDestDir, file);
        changes.push(`  hooks/${file} → .threadwork/hooks/${file}`);
        if (!isDryRun) cpSync(join(hooksSourceDir, file), dest);
      }
    }
  }

  // Update lib (hooks dependency)
  const libSourceDir = join(__dirname, '..', 'lib');
  const libDestDir = join(cwd, '.threadwork', 'lib');
  if (existsSync(libSourceDir)) {
    if (!isDryRun) cpSync(libSourceDir, libDestDir, { recursive: true });
    changes.push('  lib/ → .threadwork/lib/ (all files)');
  }

  // Update commands
  const commandsSrcDir = join(__dirname, '..', 'templates', 'commands');
  const { getCommandsDir, detectRuntime } = await import('../lib/runtime.js');
  const runtime = detectRuntime();
  const commandsDest = getCommandsDir(runtime);
  if (existsSync(commandsSrcDir)) {
    for (const file of readdirSync(commandsSrcDir)) {
      if (file.endsWith('.md')) {
        const destFile = file.replace(/^tw-/, '');
        changes.push(`  commands/${file} → ${destFile}`);
        if (!isDryRun) {
          // Remove stale tw-prefixed duplicate if present
          const stalePath = join(commandsDest, file);
          if (file !== destFile && existsSync(stalePath)) {
            const { rmSync } = await import('fs');
            rmSync(stalePath);
          }
          cpSync(join(commandsSrcDir, file), join(commandsDest, destFile));
        }
      }
    }
  }

  // Update spec TEMPLATES only (not user-created specs)
  const specsSrcDir = join(__dirname, '..', 'templates', 'specs');
  const specsDestDir = join(cwd, '.threadwork', 'specs');
  if (existsSync(specsSrcDir)) {
    for (const domain of readdirSync(specsSrcDir)) {
      const domainSrc = join(specsSrcDir, domain);
      const domainDest = join(specsDestDir, domain);
      if (statSync(domainSrc).isDirectory()) {
        for (const file of readdirSync(domainSrc)) {
          const destFile = join(domainDest, file);
          if (existsSync(destFile)) {
            changes.push(`  ⚠ Skipping ${domain}/${file} (user-modified spec preserved)`);
          } else {
            changes.push(`  specs/${domain}/${file} (new template)`);
            if (!isDryRun) cpSync(join(domainSrc, file), destFile);
          }
        }
      }
    }
  }

  return changes;
}
