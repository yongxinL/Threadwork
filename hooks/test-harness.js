#!/usr/bin/env node
/**
 * hooks/test-harness.js — Hook event simulator
 *
 * Simulates Claude Code hook events to test each hook in isolation.
 * Supports different tier settings and token budget states.
 *
 * Usage:
 *   node hooks/test-harness.js session-start
 *   node hooks/test-harness.js pre-tool-use --task "add auth"
 *   node hooks/test-harness.js post-tool-use --tool Bash
 *   node hooks/test-harness.js subagent-stop --agent tw-executor
 *   node hooks/test-harness.js all
 */

import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const TIERS = ['beginner', 'advanced', 'ninja'];
const hook = process.argv[2] ?? 'all';
const argIndex = process.argv.indexOf('--task');
const taskArg = argIndex !== -1 ? process.argv[argIndex + 1] : 'implement auth endpoint';
const tierIndex = process.argv.indexOf('--tier');
const tierArg = tierIndex !== -1 ? process.argv[tierIndex + 1] : null;
const agentIndex = process.argv.indexOf('--agent');
const agentArg = agentIndex !== -1 ? process.argv[agentIndex + 1] : 'tw-executor';
const toolIndex = process.argv.indexOf('--tool');
const toolArg = toolIndex !== -1 ? process.argv[toolIndex + 1] : 'Bash';

const PROJECT_ROOT = process.cwd();

function setupTestState(tier = 'advanced', budgetUsed = 0) {
  mkdirSync(join(PROJECT_ROOT, '.threadwork', 'state'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.threadwork', 'workspace', 'journals'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.threadwork', 'workspace', 'handoffs'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.threadwork', 'specs'), { recursive: true });

  writeFileSync(
    join(PROJECT_ROOT, '.threadwork', 'state', 'project.json'),
    JSON.stringify({
      _version: '1',
      _updated: new Date().toISOString(),
      projectName: 'TestProject',
      currentPhase: 1,
      currentMilestone: 1,
      activeTask: 'T-1-1-1: test task',
      skillTier: tier,
      sessionBudget: 800_000
    }, null, 2)
  );

  writeFileSync(
    join(PROJECT_ROOT, '.threadwork', 'state', 'token-log.json'),
    JSON.stringify({
      _version: '1',
      _updated: new Date().toISOString(),
      sessionBudget: 800_000,
      sessionUsed: budgetUsed,
      tasks: []
    }, null, 2)
  );
}

function runHook(hookName, stdin, env = {}) {
  const hookPath = join(PROJECT_ROOT, 'hooks', `${hookName}.js`);
  const result = spawnSync('node', [hookPath], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    error: result.error
  };
}

function printResult(hookName, tier, result, budgetPct) {
  const status = result.status === 0 ? '✅' : '❌';
  console.log(`\n${status} ${hookName} | tier=${tier} | budget=${budgetPct}%`);
  if (result.stderr?.trim()) {
    console.log(`  STDERR: ${result.stderr.slice(0, 200)}`);
  }
  if (result.stdout?.trim()) {
    try {
      const out = JSON.parse(result.stdout);
      console.log(`  OUTPUT: ${JSON.stringify(out).slice(0, 200)}`);
    } catch {
      console.log(`  OUTPUT: ${result.stdout.slice(0, 200)}`);
    }
  }
  if (result.error) {
    console.log(`  ERROR: ${result.error.message}`);
  }
}

const testCases = [
  { hook: 'session-start', tiers: tierArg ? [tierArg] : TIERS, budgets: [0, 640_000, 720_000] },
  { hook: 'pre-tool-use', tiers: tierArg ? [tierArg] : TIERS, budgets: [0, 720_000] },
  { hook: 'post-tool-use', tiers: tierArg ? [tierArg] : TIERS, budgets: [0, 640_000] },
  { hook: 'subagent-stop', tiers: tierArg ? [tierArg] : TIERS, budgets: [0] }
];

console.log('Threadwork Hook Test Harness');
console.log('='.repeat(50));

for (const tc of testCases) {
  if (hook !== 'all' && hook !== tc.hook) continue;

  for (const tier of tc.tiers) {
    for (const budget of tc.budgets) {
      setupTestState(tier, budget);
      const budgetPct = Math.round((budget / 800_000) * 100);

      let stdin = {};
      if (tc.hook === 'pre-tool-use') {
        stdin = {
          tool_name: 'Task',
          tool_input: { prompt: taskArg, subagent_type: 'general-purpose' }
        };
      } else if (tc.hook === 'post-tool-use') {
        stdin = {
          tool_name: toolArg,
          tool_input: { command: 'echo test' },
          tool_result: { output: 'test output' }
        };
      } else if (tc.hook === 'subagent-stop') {
        stdin = { agent_type: agentArg };
      }

      const result = runHook(tc.hook, stdin);
      printResult(tc.hook, tier, result, budgetPct);
    }
  }
}

console.log('\n' + '='.repeat(50));
console.log('Test harness complete.');
