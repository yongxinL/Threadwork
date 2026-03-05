/**
 * Unit tests for v0.3.0 Upgrade 3 — dual cost + context budget
 * Tests: loadPricing(), calculateCost(), getCostUsed(), getCostRemaining(),
 *        getCostPercent(), getDualBudgetReport(), recordUsage() with model param
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Isolate token-log writes
const tmpDir = join(tmpdir(), `tw-cost-test-${Date.now()}`);
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

// Use test-scoped pricing (no ~/.threadwork/pricing.json needed)
const {
  loadPricing,
  calculateCost,
  getCostUsed,
  getCostRemaining,
  getCostPercent,
  getDualBudgetReport,
  recordUsage,
  resetSessionUsage,
  getCostBudget
} = await import('../../lib/token-tracker.js');

describe('loadPricing', () => {
  test('returns default pricing when no file exists', () => {
    const pricing = loadPricing();
    assert.ok(pricing.models);
    assert.ok(pricing.models.haiku);
    assert.ok(pricing.models.sonnet);
    assert.ok(pricing.models.opus);
    assert.strictEqual(pricing.models.sonnet.input, 3.00);
  });
});

describe('calculateCost', () => {
  test('calculates sonnet cost correctly with 60/40 split', () => {
    // 1M tokens at sonnet: 600K input @ $3/M + 400K output @ $15/M
    // = $1.80 + $6.00 = $7.80
    const cost = calculateCost(1_000_000, 'sonnet');
    assert.ok(Math.abs(cost - 7.80) < 0.001, `Expected ~$7.80, got $${cost}`);
  });

  test('calculates haiku cost correctly', () => {
    // 1M tokens at haiku: 600K input @ $0.80/M + 400K output @ $4.00/M
    // = $0.48 + $1.60 = $2.08
    const cost = calculateCost(1_000_000, 'haiku');
    assert.ok(Math.abs(cost - 2.08) < 0.001, `Expected ~$2.08, got $${cost}`);
  });

  test('calculates opus cost correctly', () => {
    // 1M tokens at opus: 600K input @ $15/M + 400K output @ $75/M
    // = $9.00 + $30.00 = $39.00
    const cost = calculateCost(1_000_000, 'opus');
    assert.ok(Math.abs(cost - 39.00) < 0.001, `Expected ~$39.00, got $${cost}`);
  });

  test('defaults to sonnet when model unknown', () => {
    const sonnetCost = calculateCost(100_000, 'sonnet');
    const unknownCost = calculateCost(100_000, 'unknown-model');
    assert.strictEqual(sonnetCost, unknownCost);
  });

  test('returns 0 for 0 tokens', () => {
    assert.strictEqual(calculateCost(0, 'sonnet'), 0);
  });
});

describe('recordUsage with model param', () => {
  beforeEach(() => { resetSessionUsage(); });

  test('backward compat: model defaults to sonnet', () => {
    recordUsage('T-1-1', 10_000, 10_000);
    const report = getDualBudgetReport();
    assert.strictEqual(report.tasks[0].model, 'sonnet');
  });

  test('stores model in task record', () => {
    recordUsage('T-1-1', 10_000, 10_000, 'haiku');
    const report = getDualBudgetReport();
    assert.strictEqual(report.tasks[0].model, 'haiku');
  });

  test('accumulates cost across multiple tasks', () => {
    recordUsage('T-1-1', 10_000, 10_000, 'haiku');
    recordUsage('T-1-2', 10_000, 10_000, 'opus');
    const costUsed = getCostUsed();
    assert.ok(costUsed > 0, 'Cost should be positive');
  });
});

describe('getCostUsed / getCostRemaining / getCostPercent', () => {
  beforeEach(() => { resetSessionUsage(); });

  test('getCostUsed returns 0 after reset', () => {
    assert.strictEqual(getCostUsed(), 0);
  });

  test('getCostRemaining equals budget when unused', () => {
    const budget = getCostBudget();
    assert.strictEqual(getCostRemaining(), budget);
  });

  test('getCostPercent returns 0 when unused', () => {
    assert.strictEqual(getCostPercent(), 0);
  });

  test('getCostPercent reflects usage after recordUsage', () => {
    // Record a lot of opus to push cost up significantly
    recordUsage('T-1-1', 100_000, 100_000, 'opus');
    const pct = getCostPercent();
    assert.ok(pct > 0, `Expected pct > 0, got ${pct}`);
    assert.ok(pct <= 100);
  });
});

describe('getDualBudgetReport', () => {
  beforeEach(() => { resetSessionUsage(); });

  test('has token and cost sections', () => {
    const report = getDualBudgetReport();
    assert.ok(report.token);
    assert.ok(report.cost);
    assert.ok(report.modelUsage !== undefined);
    assert.ok(Array.isArray(report.tasks));
  });

  test('modelUsage aggregates by model tier', () => {
    recordUsage('T-1-1', 50_000, 50_000, 'haiku');
    recordUsage('T-1-2', 100_000, 100_000, 'sonnet');
    recordUsage('T-1-3', 30_000, 30_000, 'haiku');
    const report = getDualBudgetReport();
    assert.strictEqual(report.modelUsage.haiku.tokens, 80_000);
    assert.strictEqual(report.modelUsage.sonnet.tokens, 100_000);
  });

  test('cost section shows positive used after recording', () => {
    recordUsage('T-1-1', 50_000, 50_000, 'sonnet');
    const report = getDualBudgetReport();
    assert.ok(report.cost.used > 0);
    assert.ok(report.cost.remaining >= 0);
  });
});
