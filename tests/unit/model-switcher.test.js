/**
 * Unit tests for lib/model-switcher.js
 * Run: node --test tests/unit/model-switcher.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Isolate in a temp dir
const tmpDir = join(tmpdir(), `tw-model-switcher-test-${Date.now()}`);
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

// Enable test mode to skip stdin prompts
process.env.THREADWORK_TEST = '1';

const {
  getRecommendedModel,
  getAgentDefault,
  getAgentDefaults,
  logSwitch,
  getSwitchLog,
  setSwitchPolicy,
  requestSwitch
} = await import('../../lib/model-switcher.js');

describe('getRecommendedModel', () => {
  test('returns opus for complex agents', () => {
    assert.strictEqual(getRecommendedModel('run tests', 0, 'tw-debugger'), 'opus');
    assert.strictEqual(getRecommendedModel('plan phase', 0, 'tw-planner'), 'opus');
  });

  test('returns haiku for simple agents', () => {
    assert.strictEqual(getRecommendedModel('dispatch task', 0, 'tw-dispatch'), 'haiku');
    assert.strictEqual(getRecommendedModel('write spec', 0, 'tw-spec-writer'), 'haiku');
  });

  test('returns opus for 6+ files', () => {
    assert.strictEqual(getRecommendedModel('implement feature', 6, 'tw-executor'), 'opus');
    assert.strictEqual(getRecommendedModel('implement feature', 10, 'tw-executor'), 'opus');
  });

  test('returns opus for architectural keywords', () => {
    assert.strictEqual(getRecommendedModel('refactor the auth module', 2, 'tw-executor'), 'opus');
    assert.strictEqual(getRecommendedModel('migrate database schema', 2, 'tw-executor'), 'opus');
    assert.strictEqual(getRecommendedModel('redesign the UI architecture', 2, 'tw-executor'), 'opus');
  });

  test('returns sonnet for medium tasks', () => {
    assert.strictEqual(getRecommendedModel('implement login form', 3, 'tw-executor'), 'sonnet');
  });

  test('returns haiku for simple small tasks', () => {
    assert.strictEqual(getRecommendedModel('add a small button', 1, 'tw-executor'), 'haiku');
  });
});

describe('getAgentDefault', () => {
  test('returns correct defaults', () => {
    assert.strictEqual(getAgentDefault('tw-planner'), 'opus');
    assert.strictEqual(getAgentDefault('tw-executor'), 'sonnet');
    assert.strictEqual(getAgentDefault('tw-dispatch'), 'haiku');
  });

  test('returns sonnet for unknown agent', () => {
    assert.strictEqual(getAgentDefault('tw-unknown'), 'sonnet');
  });
});

describe('getAgentDefaults', () => {
  test('returns all 9 agent defaults', () => {
    const defaults = getAgentDefaults();
    assert.ok(defaults['tw-planner']);
    assert.ok(defaults['tw-executor']);
    assert.ok(defaults['tw-dispatch']);
    assert.strictEqual(Object.keys(defaults).length, 9);
  });
});

describe('logSwitch / getSwitchLog', () => {
  test('starts empty', () => {
    assert.deepStrictEqual(getSwitchLog(), []);
  });

  test('logs a switch', () => {
    logSwitch('sonnet', 'opus', 'T-2-1-3', 'architectural task', false);
    const log = getSwitchLog();
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].from, 'sonnet');
    assert.strictEqual(log[0].to, 'opus');
    assert.strictEqual(log[0].task_id, 'T-2-1-3');
    assert.strictEqual(log[0].reason, 'architectural task');
    assert.strictEqual(log[0].user_override, false);
    assert.ok(log[0].timestamp);
  });

  test('accumulates multiple switches', () => {
    logSwitch('haiku', 'sonnet', 'T-2-1-4', 'medium complexity', false);
    const log = getSwitchLog();
    assert.ok(log.length >= 2);
  });
});

describe('setSwitchPolicy', () => {
  test('sets valid policies without error', () => {
    assert.doesNotThrow(() => setSwitchPolicy('auto'));
    assert.doesNotThrow(() => setSwitchPolicy('notify'));
    assert.doesNotThrow(() => setSwitchPolicy('approve'));
  });

  test('throws on invalid policy', () => {
    assert.throws(() => setSwitchPolicy('invalid'), /Invalid policy/);
  });
});

describe('requestSwitch in test mode', () => {
  test('auto-approves when THREADWORK_TEST=1', async () => {
    const result = await requestSwitch('sonnet', 'opus', 'test reason', 'auto');
    assert.deepStrictEqual(result, { approved: true, userOverride: false });
  });

  test('auto-approves notify policy in test mode', async () => {
    const result = await requestSwitch('sonnet', 'opus', 'test reason', 'notify');
    assert.deepStrictEqual(result, { approved: true, userOverride: false });
  });
});
