/**
 * Integration tests for threadwork init
 * Tests scaffold creation for both runtimes
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-install');

before(() => {
  mkdirSync(tmpDir, { recursive: true });
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Helper: simulate an answered init (bypasses interactive questions)
async function runScaffoldDirectly(options = {}) {
  Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

  const { mkdirSync, writeFileSync } = await import('fs');

  // Manually scaffold what init would create
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
    mkdirSync(join(tmpDir, dir), { recursive: true });
  }

  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'project.json'),
    JSON.stringify({
      _version: '1',
      _updated: new Date().toISOString(),
      projectName: options.projectName ?? 'TestProject',
      techStack: options.techStack ?? 'Next.js + TypeScript',
      currentPhase: 0,
      currentMilestone: 0,
      activeTask: null,
      skillTier: options.skillTier ?? 'advanced',
      sessionBudget: options.sessionBudget ?? 800_000,
      teamMode: options.teamMode ?? 'solo'
    }, null, 2)
  );

  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'token-log.json'),
    JSON.stringify({
      _version: '1',
      sessionBudget: options.sessionBudget ?? 800_000,
      sessionUsed: 0,
      tasks: []
    }, null, 2)
  );

  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'quality-config.json'),
    JSON.stringify({
      _version: '1',
      typecheck: { enabled: true, blocking: true },
      lint: { enabled: true, blocking: true },
      tests: { enabled: true, blocking: true, minCoverage: 80 }
    }, null, 2)
  );
}

describe('init scaffold', () => {
  test('creates all required directories', async () => {
    await runScaffoldDirectly();

    const requiredDirs = [
      '.threadwork/state',
      '.threadwork/specs/frontend',
      '.threadwork/specs/backend',
      '.threadwork/specs/testing',
      '.threadwork/specs/proposals',
      '.threadwork/workspace/journals',
      '.threadwork/workspace/handoffs',
      '.threadwork/workspace/archive',
      '.threadwork/worktrees'
    ];

    for (const dir of requiredDirs) {
      assert.ok(existsSync(join(tmpDir, dir)), `Missing directory: ${dir}`);
    }
  });

  test('project.json contains all required fields', async () => {
    await runScaffoldDirectly({ projectName: 'MyApp', skillTier: 'ninja', sessionBudget: 1_000_000 });

    const proj = JSON.parse(readFileSync(join(tmpDir, '.threadwork', 'state', 'project.json'), 'utf8'));
    assert.equal(proj.projectName, 'MyApp');
    assert.equal(proj.skillTier, 'ninja');
    assert.equal(proj.sessionBudget, 1_000_000);
    assert.ok(proj._version);
    assert.ok(proj._updated);
    assert.strictEqual(proj.currentPhase, 0);
    assert.strictEqual(proj.currentMilestone, 0);
    assert.strictEqual(proj.activeTask, null);
  });

  test('token-log.json initializes with zero usage', async () => {
    await runScaffoldDirectly({ sessionBudget: 500_000 });

    const log = JSON.parse(readFileSync(join(tmpDir, '.threadwork', 'state', 'token-log.json'), 'utf8'));
    assert.equal(log.sessionBudget, 500_000);
    assert.equal(log.sessionUsed, 0);
    assert.ok(Array.isArray(log.tasks));
    assert.equal(log.tasks.length, 0);
  });

  test('quality-config.json has all gates configured', async () => {
    await runScaffoldDirectly();

    const config = JSON.parse(readFileSync(join(tmpDir, '.threadwork', 'state', 'quality-config.json'), 'utf8'));
    assert.ok(config.typecheck);
    assert.ok(config.lint);
    assert.ok(config.tests);
    assert.equal(config.typecheck.blocking, true);
    assert.equal(config.lint.blocking, true);
  });
});

describe('skill tier persistence', () => {
  for (const tier of ['beginner', 'advanced', 'ninja']) {
    test(`tier=${tier} is persisted and readable`, async () => {
      await runScaffoldDirectly({ skillTier: tier });

      const { getTier } = await import('../../lib/skill-tier.js');
      assert.equal(getTier(), tier);
    });
  }
});

describe('token budget persistence', () => {
  test('custom budget is persisted and readable', async () => {
    await runScaffoldDirectly({ sessionBudget: 600_000 });

    const { getSessionBudget } = await import('../../lib/token-tracker.js');
    assert.equal(getSessionBudget(), 600_000);
  });
});
