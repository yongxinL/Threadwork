#!/usr/bin/env node
/**
 * hooks/pre-tool-use.js — Subagent context injection hook
 *
 * Fires before every Task() call. Injects relevant specs, skill tier
 * instructions, and token budget status into the subagent prompt.
 *
 * Execution target: < 200ms
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

process.on('uncaughtException', (err) => {
  logHook('ERROR', `pre-tool-use uncaught: ${err.message}`);
  process.exit(0);
});

function logHook(level, message) {
  try {
    const logDir = join(process.cwd(), '.threadwork', 'state');
    mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, hook: 'pre-tool-use', message }) + '\n';
    appendFileSync(join(logDir, 'hook-log.json'), line, 'utf8');
  } catch { /* never crash */ }
}

async function main() {
  let payload = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) payload = JSON.parse(raw);
  } catch { /* malformed or empty stdin */ }

  // Only act on Task() tool calls
  const toolName = payload.tool_name ?? payload.toolName ?? '';
  if (toolName !== 'Task' && toolName !== 'task') {
    // Pass through unchanged
    process.stdout.write(JSON.stringify(payload));
    return;
  }

  try {
    const [
      { getRelevantSpecs, buildInjectionBlock, getSpecTokenCount },
      { getTier, getTierInstructions, getWarningStyle },
      { formatBudgetDashboard, checkThresholds, shouldCheckBudget }
    ] = await Promise.all([
      import('../lib/spec-engine.js'),
      import('../lib/skill-tier.js'),
      import('../lib/token-tracker.js')
    ]);

    // Extract task description from the payload
    const taskInput = payload.tool_input ?? payload.input ?? {};
    const taskDescription = taskInput.prompt ?? taskInput.description ?? taskInput.task ?? '';
    const agentType = taskInput.subagent_type ?? taskInput.agent_type ?? '';

    // Phase context from state (best-effort)
    let currentPhase = 1;
    try {
      const { getPhase } = await import('../lib/state.js');
      currentPhase = getPhase();
    } catch { /* state may not exist */ }

    const tier = getTier();
    const tierInstructions = getTierInstructions(tier);
    const budgetDashboard = formatBudgetDashboard();
    const thresholds = checkThresholds();

    // Select relevant specs for this task
    const relevantSpecs = getRelevantSpecs(taskDescription, currentPhase);
    const specTokens = getSpecTokenCount(relevantSpecs);
    const injectionBlock = buildInjectionBlock(relevantSpecs);

    // Build budget warning if needed
    let budgetWarning = '';
    if (thresholds.critical) {
      budgetWarning = getWarningStyle('critical',
        'Token budget >90%. Finish current task and run /tw:done immediately.', tier);
    } else if (thresholds.warning) {
      budgetWarning = getWarningStyle('warning',
        'Token budget >80%. Wrap up after this task or start a new session.', tier);
    }

    // Compose full injection prefix
    const injectionParts = [
      `<!-- Threadwork Context Injection -->`,
      tierInstructions,
      '',
      budgetDashboard,
      budgetWarning ? `\n${budgetWarning}` : '',
      '',
      injectionBlock
    ].filter(Boolean);

    const injectionPrefix = injectionParts.join('\n').trim();

    // Prepend injection to the task prompt
    if (taskInput.prompt !== undefined) {
      payload.tool_input.prompt = injectionPrefix + '\n\n---\n\n' + taskInput.prompt;
    } else if (taskInput.description !== undefined) {
      payload.tool_input.description = injectionPrefix + '\n\n---\n\n' + taskInput.description;
    }

    logHook('INFO', `pre-tool-use: injected ${specTokens} spec tokens | tier=${tier} | task="${taskDescription.slice(0, 60)}"`);

    process.stdout.write(JSON.stringify(payload));

  } catch (err) {
    logHook('ERROR', `pre-tool-use failed: ${err.message}`);
    // Pass through unchanged on failure
    process.stdout.write(JSON.stringify(payload));
  }
}

main().catch((err) => {
  logHook('ERROR', `pre-tool-use async error: ${err.message}`);
  process.stdout.write(JSON.stringify(payload ?? {}));
  process.exit(0);
});
