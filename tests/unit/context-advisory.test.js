/**
 * Unit tests for v0.3.0 Upgrade 2 — 200K context advisory
 * Tests: token-tracker.getHighContextAgents()
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Isolate using a temp directory
const tmpDir = join(tmpdir(), `tw-context-advisory-test-${Date.now()}`);
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

const origCwd = process.cwd;
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const {
  getHighContextAgents,
  recordUsage,
  resetSessionUsage
} = await import('../../lib/token-tracker.js');

describe('getHighContextAgents', () => {
  beforeEach(() => {
    resetSessionUsage();
  });

  test('returns empty array when no tasks recorded', () => {
    const result = getHighContextAgents();
    assert.deepStrictEqual(result, []);
  });

  test('returns empty array when no agent exceeds 150K tokens', () => {
    recordUsage('tw-planner-T-1-1', 50_000, 50_000);
    const result = getHighContextAgents();
    assert.deepStrictEqual(result, []);
  });

  test('returns agent that exceeded 150K tokens', () => {
    recordUsage('tw-planner-T-1-1', 160_000, 160_000);
    const result = getHighContextAgents();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].agentType, 'tw-planner');
    assert.strictEqual(result[0].tokens, 160_000);
  });

  test('aggregates multiple tasks from same agent', () => {
    recordUsage('tw-planner-T-1-1', 80_000, 80_000);
    recordUsage('tw-planner-T-1-2', 80_000, 80_000);
    const result = getHighContextAgents();
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].agentType, 'tw-planner');
    assert.strictEqual(result[0].tokens, 160_000);
  });

  test('does not include non-agent tasks (tool- prefix)', () => {
    recordUsage('tool-Bash-123', 200_000, 200_000);
    const result = getHighContextAgents();
    assert.deepStrictEqual(result, []);
  });

  test('sorts by tokens descending', () => {
    recordUsage('tw-debugger-T-1-1', 200_000, 200_000);
    recordUsage('tw-planner-T-2-1', 160_000, 160_000);
    const result = getHighContextAgents();
    assert.strictEqual(result[0].agentType, 'tw-debugger');
    assert.strictEqual(result[1].agentType, 'tw-planner');
  });
});
