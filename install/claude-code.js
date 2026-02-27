/**
 * install/claude-code.js — Claude Code runtime installer
 *
 * Installs hooks into settings.json (idempotent merge),
 * copies commands to ~/.claude/commands/tw/,
 * copies agents to ~/.claude/agents/.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getHooksConfig, getCommandsDir, getAgentsDir, getSettingsPath } from '../lib/runtime.js';

/**
 * Install Threadwork into Claude Code.
 * @param {{ cwd: string, global: boolean, __dirname: string }} options
 */
export async function installClaudeCode({ cwd, global: isGlobal, __dirname: pkgDir }) {
  const runtime = 'claude-code';
  const settingsPath = getSettingsPath(runtime, isGlobal);
  const commandsDir = getCommandsDir(runtime);
  const agentsDir = getAgentsDir(runtime);

  // ── Merge hooks into settings.json ────────────────────────────────────────
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      console.warn(`⚠️ Could not parse existing settings.json at ${settingsPath} — will create new`);
    }
  }

  const hooksConfig = getHooksConfig(runtime);
  settings.hooks = settings.hooks ?? {};

  for (const [eventName, newHooks] of Object.entries(hooksConfig.hooks)) {
    if (!settings.hooks[eventName]) {
      settings.hooks[eventName] = newHooks;
    } else {
      // Idempotent: only add if not already present
      const existingCommands = settings.hooks[eventName]
        .flatMap(h => (h.hooks ?? []).map(hh => hh.command));
      for (const hookEntry of newHooks) {
        const isPresent = (hookEntry.hooks ?? []).every(hh => existingCommands.includes(hh.command));
        if (!isPresent) {
          settings.hooks[eventName].push(hookEntry);
        }
      }
    }
  }

  mkdirSync(join(settingsPath, '..'), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`  ✓ Hooks merged into ${settingsPath}`);

  // ── Copy slash commands ────────────────────────────────────────────────────
  // pkgDir is the install/ subdirectory; templates/ is one level up
  const pkgRoot = join(pkgDir ?? process.cwd(), '..');
  const commandsSrcDir = join(pkgRoot, 'templates', 'commands');
  if (existsSync(commandsSrcDir)) {
    mkdirSync(commandsDir, { recursive: true });
    for (const file of readdirSync(commandsSrcDir)) {
      if (file.endsWith('.md')) {
        // Strip the "tw-" prefix so tw-new-project.md → new-project.md,
        // giving the correct /tw:new-project command (namespace comes from the tw/ dir).
        const destFile = file.replace(/^tw-/, '');
        cpSync(join(commandsSrcDir, file), join(commandsDir, destFile));
      }
    }
    console.log(`  ✓ Commands installed to ${commandsDir}`);
  } else {
    console.log(`  ⚠ No commands templates found at ${commandsSrcDir}`);
  }

  // ── Copy agent prompts ─────────────────────────────────────────────────────
  const agentsSrcDir = join(pkgRoot, 'templates', 'agents');
  if (existsSync(agentsSrcDir)) {
    mkdirSync(agentsDir, { recursive: true });
    for (const file of readdirSync(agentsSrcDir)) {
      if (file.endsWith('.md')) {
        cpSync(join(agentsSrcDir, file), join(agentsDir, file));
      }
    }
    console.log(`  ✓ Agents installed to ${agentsDir}`);
  }
}
