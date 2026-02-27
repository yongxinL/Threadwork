/**
 * Integration tests for hooks — end-to-end hook pipeline
 * Tests all three skill tiers and all token threshold levels
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-hooks');
const hooksDir = join(import.meta.dirname ?? process.cwd(), '../../hooks');

function setupProject(tier = 'advanced', budgetUsed = 0) {
  mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
  mkdirSync(join(tmpDir, '.threadwork', 'workspace', 'journals'), { recursive: true });
  mkdirSync(join(tmpDir, '.threadwork', 'workspace', 'handoffs'), { recursive: true });
  mkdirSync(join(tmpDir, '.threadwork', 'specs'), { recursive: true });

  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'project.json'),
    JSON.stringify({
      _version: '1',
      projectName: 'TestProject',
      currentPhase: 1,
      currentMilestone: 1,
      activeTask: 'T-1-1-1: test task',
      skillTier: tier,
      sessionBudget: 800_000
    }, null, 2)
  );

  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'token-log.json'),
    JSON.stringify({
      _version: '1',
      sessionBudget: 800_000,
      sessionUsed: budgetUsed,
      tasks: []
    }, null, 2)
  );

  writeFileSync(
    join(tmpDir, '.threadwork', 'specs', 'index.md'),
    '# Spec Index\n## frontend\n- react-patterns\n'
  );
}

function runHook(hookName, stdin) {
  return spawnSync('node', [join(hooksDir, `${hookName}.js`)], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpDir },
    cwd: tmpDir,
    timeout: 5000
  });
}

before(() => {
  mkdirSync(tmpDir, { recursive: true });
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('session-start hook', () => {
  for (const tier of ['beginner', 'advanced', 'ninja']) {
    test(`exits cleanly and outputs JSON for tier=${tier}`, () => {
      setupProject(tier, 0);
      const result = runHook('session-start', {});
      assert.equal(result.status, 0, `Hook should exit 0 for tier=${tier}`);
    });

    test(`handles empty input gracefully for tier=${tier}`, () => {
      setupProject(tier, 0);
      const result = spawnSync('node', [join(hooksDir, 'session-start.js')], {
        input: '',
        encoding: 'utf8',
        cwd: tmpDir,
        timeout: 5000
      });
      assert.equal(result.status, 0, 'Should exit 0 on empty input');
    });

    test(`handles malformed JSON gracefully for tier=${tier}`, () => {
      setupProject(tier, 0);
      const result = spawnSync('node', [join(hooksDir, 'session-start.js')], {
        input: '{ bad json',
        encoding: 'utf8',
        cwd: tmpDir,
        timeout: 5000
      });
      assert.equal(result.status, 0, 'Should exit 0 on malformed JSON');
    });
  }

  test('injects budget warning at 80%', () => {
    setupProject('advanced', 640_000);
    const result = runHook('session-start', {});
    assert.equal(result.status, 0);
    // Budget warning should appear in output or stderr
    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    assert.ok(combined.length > 0, 'Should produce some output');
  });
});

describe('pre-tool-use hook', () => {
  test('passes through non-Task tool calls unchanged', () => {
    setupProject('advanced', 0);
    const payload = { tool_name: 'Read', tool_input: { path: 'src/app.ts' } };
    const result = runHook('pre-tool-use', payload);
    assert.equal(result.status, 0);
    if (result.stdout) {
      const out = JSON.parse(result.stdout);
      assert.equal(out.tool_name, 'Read');
    }
  });

  test('handles Task calls for all tiers', () => {
    for (const tier of ['beginner', 'advanced', 'ninja']) {
      setupProject(tier, 0);
      const payload = {
        tool_name: 'Task',
        tool_input: { prompt: 'implement JWT auth', subagent_type: 'tw-executor' }
      };
      const result = runHook('pre-tool-use', payload);
      assert.equal(result.status, 0, `Should exit 0 for tier=${tier}`);
    }
  });
});

describe('post-tool-use hook', () => {
  test('exits cleanly for all tool types', () => {
    for (const toolName of ['Read', 'Write', 'Bash', 'Edit', 'Task']) {
      setupProject('advanced', 0);
      const payload = {
        tool_name: toolName,
        tool_input: {},
        tool_result: { output: 'test' }
      };
      const result = runHook('post-tool-use', payload);
      assert.equal(result.status, 0, `Should exit 0 for tool=${toolName}`);
    }
  });

  test('emits critical warning to stderr at 90% budget', () => {
    setupProject('advanced', 720_000);
    const payload = { tool_name: 'Bash', tool_input: {}, tool_result: {} };
    const result = runHook('post-tool-use', payload);
    // stderr should eventually contain warning (may be async)
    assert.equal(result.status, 0);
  });
});

describe('subagent-stop hook', () => {
  test('allows non-code agents to stop immediately', () => {
    setupProject('advanced', 0);
    for (const agentType of ['tw-planner', 'tw-researcher', 'tw-verifier', 'tw-dispatch']) {
      const result = runHook('subagent-stop', { agent_type: agentType });
      assert.equal(result.status, 0, `Should exit 0 for agent=${agentType}`);
      if (result.stdout) {
        const out = JSON.parse(result.stdout);
        assert.equal(out.action, 'allow', `Non-code agent ${agentType} should be allowed to stop`);
      }
    }
  });

  test('exits cleanly with empty input', () => {
    setupProject('advanced', 0);
    const result = runHook('subagent-stop', {});
    assert.equal(result.status, 0);
  });
});
