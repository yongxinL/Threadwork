/**
 * install/update.js — threadwork update command
 *
 * Updates framework files without overwriting user-customized specs or state.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, cpSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runUpdate(options) {
  const cwd = process.cwd();
  const isDryRun = options.dryRun;
  const stateDir = join(cwd, '.threadwork', 'state');

  if (!existsSync(stateDir)) {
    console.error("Threadwork is not initialized here. Run 'threadwork init' first.");
    process.exit(1);
  }

  console.log('\n── Threadwork Update ─────────────────────────────');
  if (isDryRun) console.log('🔍 DRY RUN — no changes will be applied\n');

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
  const { getCommandsDir } = await import('../lib/runtime.js');
  const { detectRuntime } = await import('../lib/runtime.js');
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

  if (changes.length === 0) {
    console.log('Nothing to update.');
  } else {
    console.log('Changes:');
    for (const c of changes) console.log(c);
  }

  if (!isDryRun) {
    // Bump _version in project.json
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
