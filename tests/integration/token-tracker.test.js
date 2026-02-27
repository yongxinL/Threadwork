/**
 * Integration tests for lib/token-tracker.js
 * Verifies 80%/90% thresholds fire at correct levels and produce tier-appropriate warnings
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-integration-tokens');
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

before(() => {
  mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

const {
  setSessionBudget,
  resetSessionUsage,
  recordUsage,
  checkThresholds,
  shouldCheckBudget,
  isOverBudget,
  getBudgetPercent,
  getBudgetReport,
  formatBudgetDashboard
} = await import('../../lib/token-tracker.js');

const { getWarningStyle, setTier } = await import('../../lib/skill-tier.js');

beforeEach(() => {
  resetSessionUsage();
  setSessionBudget(800_000);
  // Set up a project.json with default tier
  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'project.json'),
    JSON.stringify({ skillTier: 'advanced' })
  );
});

describe('80% threshold', () => {
  test('fires exactly at 80%', () => {
    recordUsage('t1', 640_000); // exactly 80%
    const t = checkThresholds();
    assert.equal(t.warning, true);
    assert.equal(t.critical, false);
    assert.equal(getBudgetPercent(), 80);
  });

  test('does not fire at 79%', () => {
    recordUsage('t1', 632_000); // 79%
    const t = checkThresholds();
    assert.equal(t.warning, false);
  });

  test('warning style differs per tier at 80%', () => {
    recordUsage('t1', 640_000);

    for (const tier of ['beginner', 'advanced', 'ninja']) {
      setTier(tier);
      const warning = getWarningStyle('warning', 'Budget at 80%', tier);
      assert.ok(typeof warning === 'string' && warning.length > 0);
      // Each tier should produce different length output
    }

    // Beginner should be most verbose
    const beginner = getWarningStyle('warning', 'Budget at 80%', 'beginner');
    const ninja = getWarningStyle('warning', 'Budget at 80%', 'ninja');
    assert.ok(beginner.length > ninja.length, 'Beginner should be more verbose than ninja');
  });
});

describe('90% threshold', () => {
  test('fires at 90%', () => {
    recordUsage('t1', 640_000); // 80%
    recordUsage('t2', 80_000);  // now 90%
    const t = checkThresholds();
    assert.equal(t.warning, true);
    assert.equal(t.critical, true);
  });

  test('isOverBudget returns true at 90%', () => {
    recordUsage('t1', 720_000);
    assert.equal(isOverBudget(), true);
  });

  test('critical warning style differs per tier', () => {
    recordUsage('t1', 720_000);

    const ninjaWarning = getWarningStyle('critical', 'Budget at 90%', 'ninja');
    const beginnerWarning = getWarningStyle('critical', 'Budget at 90%', 'beginner');
    const advancedWarning = getWarningStyle('critical', 'Budget at 90%', 'advanced');

    // Ninja: very short
    assert.ok(ninjaWarning.length < 30);
    // Beginner: mentions /tw:done
    assert.ok(beginnerWarning.includes('/tw:done') || beginnerWarning.toLowerCase().includes('session'));
    // Advanced: includes 🚨
    assert.ok(advancedWarning.includes('🚨'));
  });
});

describe('getBudgetReport', () => {
  test('session section contains budget/used/remaining/percent', () => {
    recordUsage('T-1-1', 100_000, 120_000);
    const report = getBudgetReport();
    assert.equal(report.session.budget, 800_000);
    assert.ok(report.session.used > 0);
    assert.ok(report.session.remaining < 800_000);
    assert.ok(report.session.percent > 0);
  });

  test('tasks section reflects recorded usage', () => {
    recordUsage('T-1-1', 12_000, 14_200);
    recordUsage('T-1-2', 8_000, 7_100);
    const report = getBudgetReport();
    assert.equal(report.tasks.length, 2);
    assert.equal(report.tasks[0].id, 'T-1-1');
    assert.equal(report.tasks[0].estimated, 12_000);
    assert.equal(report.tasks[0].actual, 14_200);
    assert.equal(report.tasks[0].variance, '+18%');
    assert.equal(report.tasks[0].rating, 'Good');
  });
});

describe('formatBudgetDashboard', () => {
  test('contains all required parts', () => {
    recordUsage('t', 312_000);
    const dashboard = formatBudgetDashboard();
    assert.ok(dashboard.startsWith('[TOKEN:'));
    assert.ok(dashboard.includes('312K'));
    assert.ok(dashboard.includes('800K'));
    assert.ok(dashboard.includes('%'));
    assert.ok(dashboard.includes('K remaining'));
  });

  test('shows warning text at 80%', () => {
    recordUsage('t', 640_000);
    const dashboard = formatBudgetDashboard();
    assert.ok(dashboard.includes('⚠️') || dashboard.includes('Warning'));
  });

  test('shows critical text at 90%', () => {
    recordUsage('t', 720_000);
    const dashboard = formatBudgetDashboard();
    assert.ok(dashboard.includes('🚨') || dashboard.includes('CRITICAL'));
  });
});
