/**
 * Unit tests for lib/runtime.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'os';
import { join } from 'path';

const { detectRuntime, getCommandsDir, getAgentsDir, getSettingsPath, isHookSupported } =
  await import('../../lib/runtime.js');

describe('detectRuntime', () => {
  test('returns a valid runtime value', () => {
    const runtime = detectRuntime();
    assert.ok(['claude-code', 'codex', 'unknown'].includes(runtime));
  });
});

describe('getCommandsDir', () => {
  test('claude-code: returns ~/.claude/commands/tw path', () => {
    const dir = getCommandsDir('claude-code');
    assert.ok(dir.includes('.claude'));
    assert.ok(dir.includes('commands'));
    assert.ok(dir.includes('tw'));
  });

  test('codex: returns .codex/commands path', () => {
    const dir = getCommandsDir('codex');
    assert.ok(dir.includes('codex'));
    assert.ok(dir.includes('commands'));
  });
});

describe('getAgentsDir', () => {
  test('claude-code: returns ~/.claude/agents path', () => {
    const dir = getAgentsDir('claude-code');
    assert.ok(dir.startsWith(homedir()));
    assert.ok(dir.includes('agents'));
  });
});

describe('getSettingsPath', () => {
  test('claude-code global: returns ~/.claude/settings.json', () => {
    const p = getSettingsPath('claude-code', true);
    assert.ok(p.startsWith(homedir()));
    assert.ok(p.endsWith('settings.json'));
  });

  test('claude-code local: returns project-level path', () => {
    const p = getSettingsPath('claude-code', false);
    assert.ok(p.includes(process.cwd()));
  });

  test('codex: returns codex.json path', () => {
    const p = getSettingsPath('codex');
    assert.ok(p.endsWith('codex.json'));
  });
});

describe('isHookSupported', () => {
  test('claude-code supports all hook types', () => {
    for (const hook of ['SessionStart', 'PreToolUse', 'PostToolUse', 'SubagentStop']) {
      assert.equal(isHookSupported('claude-code', hook), true);
    }
  });

  test('codex supports no hook types', () => {
    for (const hook of ['SessionStart', 'PreToolUse', 'PostToolUse', 'SubagentStop']) {
      assert.equal(isHookSupported('codex', hook), false);
    }
  });
});
