/**
 * Unit tests for lib/token-tracker.js
 * Run: node --test tests/unit/token-tracker.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// Use a temp directory as cwd for tests
const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-token');

process.chdir = (dir) => {}; // stub chdir

// Override process.cwd() for tests
const origCwd = process.cwd.bind(process);
let testCwd = tmpDir;
Object.defineProperty(process, 'cwd', { value: () => testCwd, configurable: true });

// Setup temp dir
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

const {
  estimateTokens,
  estimateTaskBudget,
  getSessionBudget,
  setSessionBudget,
  getSessionUsed,
  getBudgetRemaining,
  getBudgetPercent,
  checkThresholds,
  shouldCheckBudget,
  isOverBudget,
  recordUsage,
  getVarianceRating,
  getBudgetReport,
  formatBudgetDashboard,
  resetSessionUsage
} = await import('../../lib/token-tracker.js');

describe('estimateTokens', () => {
  test('returns 0 for empty string', () => {
    assert.equal(estimateTokens(''), 0);
  });

  test('returns chars/4 rounded up', () => {
    assert.equal(estimateTokens('abcd'), 1);    // 4 chars = 1 token
    assert.equal(estimateTokens('abcde'), 2);   // 5 chars = 2 tokens (ceil)
    assert.equal(estimateTokens('a'.repeat(100)), 25);
  });

  test('handles null/undefined gracefully', () => {
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
  });
});

describe('estimateTaskBudget', () => {
  test('simple task returns low range', () => {
    const est = estimateTaskBudget('add a button', 1);
    assert.ok(est.low < 20_000);
    assert.equal(est.complexity, 'simple');
  });

  test('complex task returns high range', () => {
    const est = estimateTaskBudget('refactor authentication database schema migration', 2);
    assert.equal(est.complexity, 'complex');
    assert.ok(est.high >= 40_000);
  });

  test('planning phase applies multiplier', () => {
    const phase1 = estimateTaskBudget('add auth', 1);
    const phase2 = estimateTaskBudget('add auth', 2);
    assert.ok(phase1.midpoint <= phase2.midpoint);
  });
});

describe('threshold detection', () => {
  beforeEach(() => {
    resetSessionUsage();
    setSessionBudget(800_000);
  });

  test('no warning below 80%', () => {
    recordUsage('t1', 600_000); // 75%
    const t = checkThresholds();
    assert.equal(t.warning, false);
    assert.equal(t.critical, false);
  });

  test('warning fires at 80%', () => {
    recordUsage('t1', 640_000); // exactly 80%
    const t = checkThresholds();
    assert.equal(t.warning, true);
    assert.equal(t.critical, false);
  });

  test('critical fires at 90%', () => {
    recordUsage('t1', 640_000); // 80%
    recordUsage('t2', 80_000);  // now 90%
    const t = checkThresholds();
    assert.equal(t.warning, true);
    assert.equal(t.critical, true);
  });

  test('shouldCheckBudget true at >=80%', () => {
    recordUsage('t1', 640_000);
    assert.equal(shouldCheckBudget(), true);
  });

  test('isOverBudget true at >=90%', () => {
    recordUsage('t1', 720_000);
    assert.equal(isOverBudget(), true);
  });
});

describe('getVarianceRating', () => {
  test('Excellent for <10% variance', () => {
    assert.equal(getVarianceRating(10_000, 10_900), 'Excellent'); // +9%
    assert.equal(getVarianceRating(10_000, 9_200), 'Excellent');  // -8%
  });

  test('Good for 10-20% variance', () => {
    assert.equal(getVarianceRating(10_000, 11_500), 'Good'); // +15%
  });

  test('Needs Improvement for >20% variance', () => {
    assert.equal(getVarianceRating(10_000, 13_000), 'Needs Improvement'); // +30%
  });
});

describe('getBudgetReport', () => {
  beforeEach(() => {
    resetSessionUsage();
    setSessionBudget(800_000);
  });

  test('includes session, tasks, phaseTotal sections', () => {
    recordUsage('T-1-1', 12_000, 14_200);
    recordUsage('T-1-2', 8_000, 7_100);
    const report = getBudgetReport();
    assert.ok(report.session);
    assert.ok(Array.isArray(report.tasks));
    assert.ok(report.phaseTotal);
    assert.equal(report.tasks.length, 2);
    assert.equal(report.tasks[0].id, 'T-1-1');
  });
});

describe('formatBudgetDashboard', () => {
  beforeEach(() => {
    resetSessionUsage();
    setSessionBudget(800_000);
  });

  test('includes token counts and percentage', () => {
    recordUsage('t', 312_000);
    const dash = formatBudgetDashboard();
    assert.ok(dash.includes('312K'));
    assert.ok(dash.includes('800K'));
    assert.ok(dash.includes('39%'));
  });

  test('includes warning at 80%', () => {
    recordUsage('t', 640_000);
    const dash = formatBudgetDashboard();
    assert.ok(dash.includes('⚠️') || dash.includes('Warning'));
  });

  test('includes critical at 90%', () => {
    recordUsage('t', 720_000);
    const dash = formatBudgetDashboard();
    assert.ok(dash.includes('🚨') || dash.includes('CRITICAL'));
  });
});
