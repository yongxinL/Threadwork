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

// ── Shared: collect standard framework file updates ───────────────────────────

async function collectFrameworkUpdates(cwd, isDryRun) {
  const changes = [];

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
        changes.push(`  commands/${file}`);
        if (!isDryRun) cpSync(join(commandsSrcDir, file), join(commandsDest, file));
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
