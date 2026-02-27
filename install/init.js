/**
 * install/init.js — threadwork init implementation
 *
 * Asks 6 setup questions, scaffolds .threadwork/, registers hooks,
 * installs commands and agents.
 */

import { createInterface } from 'readline';
import { mkdirSync, writeFileSync, existsSync, cpSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectRuntime } from '../lib/runtime.js';
import { installClaudeCode } from './claude-code.js';
import { installCodex } from './codex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

/**
 * Run the interactive init flow.
 * @param {{ runtime: string, global: boolean, dryRun: boolean }} options
 */
export async function runInit(options) {
  const cwd = process.cwd();
  const { dryRun } = options;
  const isDryRun = dryRun;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Threadwork — Project Setup             ║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN — no files will be written\n');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Detect runtime
    let runtime = options.runtime === 'auto' ? detectRuntime() : options.runtime;
    if (runtime === 'unknown') {
      console.log('⚠️ Could not auto-detect runtime. Defaulting to claude-code.');
      runtime = 'claude-code';
    }
    console.log(`✓ Detected runtime: ${runtime}\n`);

    // ── Question 1: Project name ───────────────────────────────────────────
    const projectName = await ask(rl, '1. Project name: ');

    // ── Question 2: Tech stack ─────────────────────────────────────────────
    console.log('\n2. Tech stack (choose or enter your own):');
    console.log('   1) Next.js + TypeScript');
    console.log('   2) React + Vite + TypeScript');
    console.log('   3) Express + Node.js');
    console.log('   4) FastAPI + Python');
    console.log('   5) Other (describe)');
    const stackAnswer = await ask(rl, '   Choice or description: ');
    const stackMap = {
      '1': 'Next.js + TypeScript',
      '2': 'React + Vite + TypeScript',
      '3': 'Express + Node.js',
      '4': 'FastAPI + Python'
    };
    const techStack = stackMap[stackAnswer.trim()] ?? stackAnswer.trim();

    // ── Question 3: Quality thresholds ───────────────────────────────────
    console.log('\n3. Quality thresholds:');
    const coverageAnswer = await ask(rl, '   Minimum test coverage % (default: 80): ');
    const minCoverage = parseInt(coverageAnswer.trim() || '80', 10) || 80;

    console.log('   Lint rules:');
    console.log('   1) Strict (0 warnings allowed)');
    console.log('   2) Standard (up to 10 warnings)');
    console.log('   3) Relaxed (errors only)');
    const lintAnswer = await ask(rl, '   Choice (default: 1): ');
    const lintMap = { '1': 'strict', '2': 'standard', '3': 'relaxed' };
    const lintLevel = lintMap[lintAnswer.trim() || '1'] ?? 'strict';

    // ── Question 4: Team or solo ──────────────────────────────────────────
    console.log('\n4. Team or solo mode:');
    console.log('   1) Solo (single developer)');
    console.log('   2) Small team (2–3 people)');
    console.log('   3) Team (4+ people)');
    const teamAnswer = await ask(rl, '   Choice (default: 1): ');
    const teamMap = { '1': 'solo', '2': 'small-team', '3': 'team' };
    const teamMode = teamMap[teamAnswer.trim() || '1'] ?? 'solo';

    // ── Question 5: Skill tier ─────────────────────────────────────────────
    console.log('\n5. Skill tier (controls AI output verbosity):');
    console.log('   1) Beginner  — step-by-step explanations, inline comments');
    console.log('   2) Advanced  — concise, professional (recommended)');
    console.log('   3) Ninja     — code only, zero narration');
    const tierAnswer = await ask(rl, '   Choice (default: 2): ');
    const tierMap = { '1': 'beginner', '2': 'advanced', '3': 'ninja' };
    const skillTier = tierMap[tierAnswer.trim() || '2'] ?? 'advanced';

    // ── Question 6: Session token budget ──────────────────────────────────
    console.log('\n6. Session token budget:');
    console.log('   Default is 800K (80% of Sonnet\'s 1M context)');
    console.log('   Lower if using a smaller model; higher if using Opus with extended context');
    const budgetAnswer = await ask(rl, '   Budget in thousands (default: 800): ');
    const sessionBudget = (parseInt(budgetAnswer.trim() || '800', 10) || 800) * 1000;

    rl.close();

    // ── Confirm ───────────────────────────────────────────────────────────
    console.log('\n── Summary ──────────────────────────────────');
    console.log(`  Project:      ${projectName}`);
    console.log(`  Stack:        ${techStack}`);
    console.log(`  Coverage:     ${minCoverage}%  |  Lint: ${lintLevel}`);
    console.log(`  Team mode:    ${teamMode}`);
    console.log(`  Skill tier:   ${skillTier}`);
    console.log(`  Token budget: ${(sessionBudget / 1000).toFixed(0)}K`);
    console.log(`  Runtime:      ${runtime}`);
    console.log('─────────────────────────────────────────────\n');

    if (isDryRun) {
      console.log('DRY RUN complete — no files written.');
      return;
    }

    // ── Scaffold .threadwork/ ─────────────────────────────────────────────
    const dirs = [
      '.threadwork/state/phases',
      '.threadwork/specs/frontend',
      '.threadwork/specs/backend',
      '.threadwork/specs/testing',
      '.threadwork/specs/proposals',
      '.threadwork/workspace/journals',
      '.threadwork/workspace/handoffs',
      '.threadwork/workspace/archive',
      '.threadwork/worktrees'
    ];

    for (const dir of dirs) {
      mkdirSync(join(cwd, dir), { recursive: true });
    }

    // Write project.json
    const projectState = {
      _version: '1',
      _updated: new Date().toISOString(),
      projectName,
      techStack,
      currentPhase: 0,
      currentMilestone: 0,
      activeTask: null,
      skillTier,
      sessionBudget,
      teamMode,
      qualityConfig: { minCoverage, lintLevel }
    };
    writeFileSync(
      join(cwd, '.threadwork', 'state', 'project.json'),
      JSON.stringify(projectState, null, 2)
    );

    // Write quality-config.json
    const qualityConfig = {
      _version: '1',
      typecheck: { enabled: true, blocking: true },
      lint: { enabled: true, blocking: lintLevel !== 'relaxed' },
      tests: { enabled: true, blocking: true, minCoverage },
      build: { enabled: false, blocking: false },
      security: { enabled: true, blocking: false }
    };
    writeFileSync(
      join(cwd, '.threadwork', 'state', 'quality-config.json'),
      JSON.stringify(qualityConfig, null, 2)
    );

    // Write token-log.json
    const tokenLog = {
      _version: '1',
      _updated: new Date().toISOString(),
      sessionBudget,
      sessionUsed: 0,
      tasks: []
    };
    writeFileSync(
      join(cwd, '.threadwork', 'state', 'token-log.json'),
      JSON.stringify(tokenLog, null, 2)
    );

    // Copy hooks to .threadwork/hooks/
    const hooksDestDir = join(cwd, '.threadwork', 'hooks');
    mkdirSync(hooksDestDir, { recursive: true });
    const hooksSourceDir = join(__dirname, '..', 'hooks');
    if (existsSync(hooksSourceDir)) {
      for (const file of readdirSync(hooksSourceDir)) {
        if (file.endsWith('.js') && file !== 'test-harness.js') {
          cpSync(join(hooksSourceDir, file), join(hooksDestDir, file));
        }
      }
      // Also copy the lib/ directory needed by hooks
      const libDestDir = join(cwd, '.threadwork', 'lib');
      mkdirSync(libDestDir, { recursive: true });
      const libSourceDir = join(__dirname, '..', 'lib');
      if (existsSync(libSourceDir)) {
        cpSync(libSourceDir, libDestDir, { recursive: true });
      }
    }

    // Copy starter spec templates
    const specsTemplateDir = join(__dirname, '..', 'templates', 'specs');
    if (existsSync(specsTemplateDir)) {
      cpSync(specsTemplateDir, join(cwd, '.threadwork', 'specs'), { recursive: true });
    }

    // Copy guide to project root — CLAUDE.md for Claude Code, AGENTS.md for Codex
    const agentsMdSrc = join(__dirname, '..', 'templates', 'AGENTS.md');
    if (existsSync(agentsMdSrc)) {
      const destFilename = runtime === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md';
      cpSync(agentsMdSrc, join(cwd, destFilename));
    }

    // Install runtime-specific files
    if (runtime === 'claude-code') {
      await installClaudeCode({ cwd, global: options.global, __dirname });
    } else if (runtime === 'codex') {
      await installCodex({ cwd, __dirname });
    }

    // Success summary
    console.log('✅ Threadwork installed!\n');
    console.log('What was installed:');
    console.log('  📁 .threadwork/          — Framework state directory');
    const guideFile = runtime === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md';
    console.log(`  📝 ${guideFile.padEnd(20)} — Project-level guide`);
    console.log(`  🪝 4 hooks               — session-start, pre-tool-use, post-tool-use, subagent-stop`);
    if (runtime === 'claude-code') {
      console.log('  ⚙️  ~/.claude/settings.json — Hooks registered');
      console.log('  📋 ~/.claude/commands/tw/ — Slash commands installed');
      console.log('  🤖 ~/.claude/agents/     — Agent prompts installed');
    } else {
      console.log('  📋 AGENTS.md             — Codex behavioral instructions generated');
    }
    console.log('\nNext steps:');
    console.log('  1. Start a new Claude Code session');
    console.log('  2. Run /tw:new-project to initialize your project');
    console.log('  3. Run /tw:plan-phase 1 when ready to plan');

  } catch (err) {
    rl.close();
    throw err;
  }
}
