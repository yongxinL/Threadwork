#!/usr/bin/env node
/**
 * hooks/subagent-stop.js — The Ralph Loop
 *
 * Fires when a subagent tries to stop (SubagentStop event).
 * Runs quality gates; if they fail, blocks completion and re-invokes
 * the agent with a correction prompt (tier-appropriate formatting).
 * Retries up to MAX_RETRIES times before escalating to user.
 *
 * Execution target: < 2s
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const MAX_RETRIES = 5;
const RALPH_STATE_PATH = () => join(process.cwd(), '.threadwork', 'state', 'ralph-state.json');

process.on('uncaughtException', (err) => {
  logHook('ERROR', `subagent-stop uncaught: ${err.message}`);
  // Allow completion on crash to avoid infinite loops
  process.stdout.write(JSON.stringify({ action: 'allow' }));
  process.exit(0);
});

function logHook(level, message) {
  try {
    const logDir = join(process.cwd(), '.threadwork', 'state');
    mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, hook: 'subagent-stop', message }) + '\n';
    appendFileSync(join(logDir, 'hook-log.json'), line, 'utf8');
  } catch { /* never crash */ }
}

function readRalphState() {
  const p = RALPH_STATE_PATH();
  if (!existsSync(p)) return { retries: 0, lastTaskId: null, lastUpdated: null };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { retries: 0 }; }
}

function writeRalphState(data) {
  mkdirSync(join(process.cwd(), '.threadwork', 'state'), { recursive: true });
  writeFileSync(RALPH_STATE_PATH(), JSON.stringify({
    _version: '1',
    _updated: new Date().toISOString(),
    ...data
  }, null, 2), 'utf8');
}

function clearRalphState() {
  writeRalphState({ retries: 0, lastTaskId: null, cleared: true });
}

/**
 * Format quality gate errors for the correction prompt, tier-appropriate.
 * @param {object[]} results
 * @param {string} tier
 * @returns {string}
 */
function formatCorrectionPrompt(results, tier) {
  const failed = results.filter(r => !r.passed && !r.skipped);

  if (tier === 'ninja') {
    const errors = failed.map(r => {
      const errs = r.errors ?? r.failures ?? r.vulnerabilities ?? [];
      return `${r.gate.toUpperCase()}:\n${errs.slice(0, 3).join('\n')}`;
    });
    return `Fix these errors:\n\n${errors.join('\n\n')}`;
  }

  if (tier === 'beginner') {
    const sections = failed.map(r => {
      const errs = r.errors ?? r.failures ?? r.vulnerabilities ?? [];
      return [
        `### ${r.gate.charAt(0).toUpperCase() + r.gate.slice(1)} Errors`,
        `These ${r.gate} errors need to be fixed before your changes can be accepted:`,
        '',
        errs.slice(0, 5).map(e => `- \`${e}\``).join('\n'),
        '',
        `Fix each error listed above, then your changes will pass the quality check.`
      ].join('\n');
    });
    return [
      '## Quality Gate Failures — Please Fix',
      '',
      'Some automated checks failed on your code. Here is what needs to be fixed:',
      '',
      ...sections
    ].join('\n');
  }

  // advanced (default)
  const sections = failed.map(r => {
    const errs = r.errors ?? r.failures ?? r.vulnerabilities ?? [];
    return `**${r.gate}**: ${errs.slice(0, 3).join('; ')}`;
  });
  return `Quality gates failed. Fix and re-verify:\n\n${sections.join('\n')}`;
}

async function main() {
  let payload = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) payload = JSON.parse(raw);
  } catch { /* empty stdin */ }

  // Determine agent type from payload
  const agentType = payload.agent_type ?? payload.subagent_type ?? '';
  const agentName = payload.agent_name ?? '';

  // Skip quality gates for non-code agents (coordinators, planners, etc.)
  const nonCodeAgents = [
    'planner', 'researcher', 'verifier', 'dispatch', 'spec-writer',
    'tw-planner', 'tw-researcher', 'tw-verifier', 'tw-dispatch', 'tw-spec-writer',
    'tw-orchestrator'  // Team model orchestrator — coordinates, does not write code
  ];
  const isNonCode = nonCodeAgents.some(a => agentType.includes(a) || agentName.includes(a));

  if (isNonCode) {
    clearRalphState();
    process.stdout.write(JSON.stringify({ action: 'allow' }));
    return;
  }

  // Log team context if a team session is active
  try {
    const { readTeamSession } = await import('../lib/state.js');
    const teamSession = readTeamSession();
    if (teamSession && !teamSession.cleared && teamSession.status === 'active') {
      logHook('INFO', `subagent-stop: team=${teamSession.teamName} worker=${agentName || agentType}`);
    }
  } catch { /* never crash */ }

  try {
    const { runAll } = await import('../lib/quality-gate.js');
    const { getTier, getWarningStyle } = await import('../lib/skill-tier.js');

    const tier = getTier();
    const gateResult = await runAll({ skipCache: true });
    const ralph = readRalphState();

    if (gateResult.passed) {
      // All gates pass — allow completion
      clearRalphState();
      logHook('INFO', `subagent-stop: gates PASSED | tier=${tier}`);
      process.stdout.write(JSON.stringify({ action: 'allow' }));
      return;
    }

    // Gates failed
    const retries = (ralph.retries ?? 0) + 1;

    if (retries > MAX_RETRIES) {
      // Escalate to user
      const failedGates = gateResult.results.filter(r => !r.passed && !r.skipped).map(r => r.gate);
      const escalation = getWarningStyle('critical',
        `Quality gates failed after ${MAX_RETRIES} retries: ${failedGates.join(', ')}. Manual intervention required.`,
        tier
      );
      logHook('ERROR', `subagent-stop: max retries reached (${MAX_RETRIES}) | gates=${failedGates.join(',')}`);

      process.stderr.write(`\n${escalation}\n`);
      clearRalphState();
      // Allow completion to unblock — user must resolve manually
      process.stdout.write(JSON.stringify({ action: 'allow', escalation }));
      return;
    }

    // Write updated retry count
    writeRalphState({ retries, lastUpdated: new Date().toISOString() });

    // Build correction prompt
    const correctionPrompt = formatCorrectionPrompt(gateResult.results, tier);

    logHook('WARNING', `subagent-stop: gates FAILED (retry ${retries}/${MAX_RETRIES}) | tier=${tier}`);

    // Block completion and re-invoke with correction
    process.stdout.write(JSON.stringify({
      action: 'block',
      retry: true,
      message: correctionPrompt,
      retryCount: retries,
      maxRetries: MAX_RETRIES
    }));

  } catch (err) {
    logHook('ERROR', `subagent-stop quality gate error: ${err.message}`);
    // Allow completion on error to prevent infinite blocking
    process.stdout.write(JSON.stringify({ action: 'allow' }));
  }
}

main().catch((err) => {
  logHook('ERROR', `subagent-stop async error: ${err.message}`);
  process.stdout.write(JSON.stringify({ action: 'allow' }));
  process.exit(0);
});
