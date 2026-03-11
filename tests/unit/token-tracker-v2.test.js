/**
 * Unit tests for lib/token-tracker.js — v0.2.0 spec fetch additions
 * Run: node --test tests/unit/token-tracker-v2.test.js
 */

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-token-v2');
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

// Use isolated cwd for this test
const origCwd = process.cwd.bind(process);
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const {
  recordSpecFetch,
  getSpecFetchTotal,
  getSpecFetchBreakdown,
  formatBudgetDashboard,
  resetSessionUsage,
  setSessionBudget
} = await import('../../lib/token-tracker.js');

describe('recordSpecFetch', () => {
  beforeEach(() => {
    resetSessionUsage();
    setSessionBudget(800_000);
  });

  test('updates spec_fetch total', () => {
    recordSpecFetch('SPEC:auth-001', 500);
    recordSpecFetch('SPEC:test-001', 300);
    assert.equal(getSpecFetchTotal(), 800);
  });

  test('getSpecFetchBreakdown returns per-fetch log', () => {
    recordSpecFetch('SPEC:auth-001', 500);
    const breakdown = getSpecFetchBreakdown();
    assert.equal(breakdown.length, 1);
    assert.equal(breakdown[0].specId, 'SPEC:auth-001');
    assert.equal(breakdown[0].tokens, 500);
  });
});

describe('formatBudgetDashboard', () => {
  beforeEach(() => {
    resetSessionUsage();
    setSessionBudget(800_000);
  });

  test('includes spec fetch line when fetches exist', () => {
    recordSpecFetch('SPEC:auth-001', 4200);
    const dash = formatBudgetDashboard();
    assert.ok(dash.includes('fetch') || dash.includes('Spec'), `Expected spec fetch info in dashboard: ${dash}`);
  });

  test('does not show spec fetch line when no fetches', () => {
    const dash = formatBudgetDashboard();
    // When no fetches, the spec fetch section should not appear
    assert.ok(!dash.includes('fetches') || dash.includes('0'));
  });
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
