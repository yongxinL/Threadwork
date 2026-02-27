#!/usr/bin/env node
/**
 * hooks/post-tool-use.js — Learning capture + token tracking + checkpoint
 *
 * Fires after every tool call completes. Detects learning signals,
 * proposes spec updates, tracks tokens, and writes checkpoint.
 *
 * Execution target: < 100ms (defer heavy work to async queues)
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

process.on('uncaughtException', (err) => {
  logHook('ERROR', `post-tool-use uncaught: ${err.message}`);
  process.exit(0);
});

function logHook(level, message) {
  try {
    const logDir = join(process.cwd(), '.threadwork', 'state');
    mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, hook: 'post-tool-use', message }) + '\n';
    appendFileSync(join(logDir, 'hook-log.json'), line, 'utf8');
  } catch { /* never crash */ }
}

/** Estimate tokens used by a tool call from its input/output sizes */
function estimateToolTokens(toolInput, toolOutput) {
  const inputSize = JSON.stringify(toolInput ?? {}).length;
  const outputSize = JSON.stringify(toolOutput ?? {}).length;
  return Math.ceil((inputSize + outputSize) / 4);
}

/**
 * Detect learning signals from tool call result.
 * Returns array of { type, content, confidence } proposals.
 */
function detectLearningSignals(toolName, toolOutput) {
  const signals = [];
  const outputStr = JSON.stringify(toolOutput ?? '').toLowerCase();

  // Lint error fixed
  if ((toolName === 'Edit' || toolName === 'Write') &&
      (outputStr.includes('eslint') || outputStr.includes('lint error'))) {
    signals.push({
      type: 'lint-fix',
      confidence: 0.3,
      content: `Lint error detected and fixed in ${toolName} call`
    });
  }

  // TypeScript error corrected
  if (outputStr.includes('ts error') || outputStr.includes('type error') ||
      outputStr.includes('error ts')) {
    signals.push({
      type: 'typescript-fix',
      confidence: 0.3,
      content: 'TypeScript error pattern corrected'
    });
  }

  // Test caught a bug
  if ((toolName === 'Bash') && outputStr.includes('test') &&
      (outputStr.includes('fail') || outputStr.includes('pass'))) {
    signals.push({
      type: 'test-pattern',
      confidence: 0.4,
      content: 'Test execution result captured'
    });
  }

  return signals;
}

async function main() {
  const start = Date.now();
  let payload = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) payload = JSON.parse(raw);
  } catch { /* malformed or empty stdin */ }

  // Pass through immediately (we operate on side-effects, not payload modification)
  process.stdout.write(JSON.stringify(payload));

  // All remaining work is deferred (async, non-blocking for output)
  setImmediate(async () => {
    try {
      const toolName = payload.tool_name ?? payload.toolName ?? '';
      const toolInput = payload.tool_input ?? payload.input ?? {};
      const toolOutput = payload.tool_result ?? payload.result ?? {};

      // 1. Estimate token usage for this tool call
      const tokensUsed = estimateToolTokens(toolInput, toolOutput);

      // 2. Record usage
      try {
        const { recordUsage, checkThresholds, getSessionUsed } = await import('../lib/token-tracker.js');
        const taskId = `tool-${toolName}-${Date.now()}`;
        recordUsage(taskId, tokensUsed, tokensUsed);

        // 3. Check thresholds and emit visible warnings
        const thresholds = checkThresholds();
        const used = getSessionUsed();
        const usedK = Math.round(used / 1000);

        if (thresholds.critical) {
          // Emit to stderr — visible to user in Claude Code terminal
          process.stderr.write(
            `\n🚨 [THREADWORK] Token budget CRITICAL: ${usedK}K used. ` +
            `Run /tw:done NOW to generate handoff before context is lost.\n`
          );
          logHook('CRITICAL', `Token budget critical: ${usedK}K used`);
        } else if (thresholds.warning) {
          process.stderr.write(
            `\n⚠️ [THREADWORK] Token budget at 80%+: ${usedK}K used. ` +
            `Consider wrapping up after the current task.\n`
          );
          logHook('WARNING', `Token budget warning: ${usedK}K used`);
        }
      } catch { /* token tracker not initialized */ }

      // 4. Detect learning signals and write proposals
      const signals = detectLearningSignals(toolName, toolOutput);
      if (signals.length > 0) {
        try {
          const { proposeSpecUpdate } = await import('../lib/spec-engine.js');
          for (const signal of signals) {
            proposeSpecUpdate(
              `auto/${signal.type}`,
              `# Auto-Detected Pattern\n\n${signal.content}`,
              `Auto-detected from ${toolName} call (confidence: ${signal.confidence})`
            );
          }
        } catch { /* spec engine may not be ready */ }
      }

      // 5. Write checkpoint
      try {
        const { getGitInfo, writeCheckpoint, readState } = await import('../lib/state.js');
        const gitInfo = getGitInfo();
        let state = {};
        try { state = readState(); } catch { /* ok */ }
        writeCheckpoint({
          phase: state.currentPhase,
          milestone: state.currentMilestone,
          activeTask: state.activeTask,
          branch: gitInfo.branch,
          lastSha: gitInfo.sha,
          uncommittedCount: gitInfo.uncommitted.length,
          updatedByHook: 'post-tool-use'
        });
      } catch { /* state may not exist */ }

      const elapsed = Date.now() - start;
      logHook('INFO', `post-tool-use: ${toolName} | ${tokensUsed} tokens | ${elapsed}ms`);

    } catch (err) {
      logHook('ERROR', `post-tool-use deferred error: ${err.message}`);
    }
  });
}

main().catch((err) => {
  logHook('ERROR', `post-tool-use async error: ${err.message}`);
  process.exit(0);
});
