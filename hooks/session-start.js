#!/usr/bin/env node
/**
 * hooks/session-start.js — Session initialization hook
 *
 * Fires at every Claude Code SessionStart event.
 * Reads stdin (hook payload JSON), composes an orientation block,
 * and writes it back to stdout to inject into the system prompt.
 *
 * Execution target: < 500ms
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Hook must never crash the session
process.on('uncaughtException', (err) => {
  logHook('ERROR', `session-start uncaught: ${err.message}`);
  process.exit(0); // exit 0 = don't block session
});

function logHook(level, message) {
  try {
    const logDir = join(process.cwd(), '.threadwork', 'state');
    mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, hook: 'session-start', message }) + '\n';
    appendFileSync(join(logDir, 'hook-log.json'), line, 'utf8');
  } catch { /* log failures must never crash */ }
}

async function main() {
  // Read hook payload from stdin
  let payload = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) payload = JSON.parse(raw);
  } catch {
    // No stdin or malformed — continue with empty payload
  }

  // Check for --minimal mode flag
  const minimal = payload.minimal || process.argv.includes('--minimal');

  try {
    // Dynamic imports here to avoid crashing if .threadwork doesn't exist yet
    const [
      { readState },
      { readCheckpoint, checkpointExists },
      { readLatestJournal },
      { readLatestHandoff },
      { loadSpecIndex },
      { formatBudgetDashboard, resetSessionUsage },
      { getTier, getTierInstructions, getWarningStyle }
    ] = await Promise.all([
      import('../lib/state.js'),
      import('../lib/state.js'),
      import('../lib/journal.js'),
      import('../lib/handoff.js'),
      import('../lib/spec-engine.js'),
      import('../lib/token-tracker.js'),
      import('../lib/skill-tier.js')
    ]);

    // Reset session usage tracking at session start
    resetSessionUsage();

    let projectName = 'Unknown Project';
    let currentPhase = 'unknown';
    let currentMilestone = 'unknown';
    let activeTask = 'None';
    let skillTier = 'advanced';

    try {
      const state = readState();
      projectName = state.projectName ?? 'Unknown Project';
      currentPhase = state.currentPhase ?? 'unknown';
      currentMilestone = state.currentMilestone ?? 'unknown';
      activeTask = state.activeTask ?? 'None';
      skillTier = state.skillTier ?? 'advanced';
    } catch { /* project not yet initialized */ }

    if (minimal) {
      // Minimal mode: only project name and current task
      const block = `## Threadwork Context\n**Project**: ${projectName} | **Task**: ${activeTask}\n`;
      logHook('INFO', `session-start minimal mode: ${block.length} bytes`);
      process.stdout.write(JSON.stringify({ type: 'system', content: block }));
      return;
    }

    // Gather all context
    const latestJournal = readLatestJournal();
    const latestHandoff = readLatestHandoff();
    const specIndex = loadSpecIndex();
    const budgetDashboard = formatBudgetDashboard();
    const hasCheckpoint = checkpointExists();
    const tierInstructions = getTierInstructions(skillTier);

    // Extract last session summary from journal (first 3 non-empty lines after the header)
    let lastSessionSummary = '_No previous session recorded._';
    if (latestJournal) {
      const lines = latestJournal.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 3);
      lastSessionSummary = lines.join(' ').slice(0, 300);
    }

    const parts = [
      `## Threadwork — Session Context`,
      `**Project**: ${projectName} | **Phase**: ${currentPhase} | **Milestone**: ${currentMilestone}`,
      `**Active task**: ${activeTask}`,
      '',
      `${budgetDashboard}`,
      ''
    ];

    if (hasCheckpoint) {
      let cp = {};
      try { cp = readCheckpoint(); } catch { /* ignore */ }
      parts.push(
        `> ⚠️ Recovery checkpoint found from ${cp._updated?.slice(0, 10) ?? 'previous session'}.`,
        `> Run \`/tw:resume\` to restore context, or \`/tw:recover\` if session was interrupted.`,
        ''
      );
    }

    parts.push(
      `### Last Session Summary`,
      lastSessionSummary,
      ''
    );

    if (specIndex) {
      parts.push(`### Active Spec Domains`, specIndex.slice(0, 800), '');
    }

    parts.push(tierInstructions);

    const orientationBlock = parts.join('\n');
    const bytesInjected = orientationBlock.length;

    logHook('INFO', `session-start injected ${bytesInjected} bytes | tier=${skillTier} | checkpoint=${hasCheckpoint}`);

    // Output in Claude Code hook format
    process.stdout.write(JSON.stringify({ type: 'system', content: orientationBlock }));

  } catch (err) {
    logHook('ERROR', `session-start failed: ${err.message}`);
    // Exit cleanly — don't block session
  }
}

main().catch((err) => {
  logHook('ERROR', `session-start async error: ${err.message}`);
  process.exit(0);
});
