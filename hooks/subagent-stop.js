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
  if (!existsSync(p)) return { retries: 0, lastTaskId: null, lastUpdated: null, remediation_log: [] };
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    if (!data.remediation_log) data.remediation_log = [];
    return data;
  } catch { return { retries: 0, remediation_log: [] }; }
}

function writeRalphState(data) {
  mkdirSync(join(process.cwd(), '.threadwork', 'state'), { recursive: true });
  writeFileSync(RALPH_STATE_PATH(), JSON.stringify({
    _version: '1',
    _updated: new Date().toISOString(),
    ...data
  }, null, 2), 'utf8');
}

/**
 * Clear ralph-state but preserve the remediation_log by moving it to hook-log.json
 * under a ralph_loop_history key. Keeps the learning record across sessions.
 */
function clearRalphState() {
  const current = readRalphState();
  const remediationLog = current.remediation_log ?? [];

  if (remediationLog.length > 0) {
    try {
      const logDir = join(process.cwd(), '.threadwork', 'state');
      const hookLogPath = join(logDir, 'hook-log.json');
      // Append a history record to hook-log.json
      const historyLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        hook: 'subagent-stop',
        message: 'ralph-state cleared',
        ralph_loop_history: remediationLog
      }) + '\n';
      appendFileSync(hookLogPath, historyLine, 'utf8');
    } catch { /* never crash */ }
  }

  writeRalphState({ retries: 0, lastTaskId: null, cleared: true, remediation_log: [] });
}

/**
 * Build the correction prompt from a structured remediation payload.
 * Includes primary violation, relevant spec, fix template, and raw failing errors.
 *
 * @param {object} rejectionPayload - Full rejection payload with remediation block
 * @param {string} tier - Skill tier
 * @returns {string}
 */
function buildRemediationPrompt(rejectionPayload, tier) {
  const { iteration, gates, remediation } = rejectionPayload;
  const maxRetries = MAX_RETRIES;

  const failedGates = Object.entries(gates ?? {})
    .filter(([, v]) => v && !v.passed && !v.skipped)
    .map(([gate, v]) => {
      const errs = v.errors ?? v.failures ?? v.vulnerabilities ?? [];
      return `${gate.toUpperCase()}:\n${errs.slice(0, 5).map(e => `  ${e}`).join('\n')}`;
    });

  const parts = [
    `QUALITY GATE REJECTION (iteration ${iteration} of ${maxRetries})`,
    '',
    `Primary violation: ${remediation?.primary_violation ?? 'Unknown'}`,
  ];

  if (remediation?.relevant_spec && remediation.relevant_spec !== 'None identified') {
    parts.push(`Relevant spec: ${remediation.relevant_spec}`);
  }

  parts.push(`Fix required: ${remediation?.fix_template ?? 'Review gate output below.'}`);

  if (failedGates.length > 0) {
    parts.push('', 'Raw errors:', ...failedGates);
  }

  return parts.join('\n');
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
    const { runAll, buildRemediationBlock } = await import('../lib/quality-gate.js');
    const { getTier, getWarningStyle } = await import('../lib/skill-tier.js');
    const specEngine = await import('../lib/spec-engine.js');

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

    // Build structured remediation block
    const remediation = buildRemediationBlock(gateResult, specEngine, tier);

    // Build structured rejection payload
    const gatesMap = {};
    for (const r of gateResult.results) {
      gatesMap[r.gate] = {
        passed: r.passed,
        skipped: r.skipped ?? false,
        errors: r.errors ?? r.failures ?? r.vulnerabilities ?? []
      };
    }
    const rejectionPayload = {
      status: 'rejected',
      iteration: retries,
      gates: gatesMap,
      remediation
    };

    // Append to remediation_log (preserved on clear)
    const remediationLog = ralph.remediation_log ?? [];
    remediationLog.push({
      iteration: retries,
      timestamp: new Date().toISOString(),
      primary_violation: remediation.primary_violation,
      relevant_spec: remediation.relevant_spec,
      learning_signal: remediation.learning_signal,
      proposal_queued: false
    });

    // Queue learning signal as spec proposal (confidence 0.3, ralph-loop source)
    let proposalQueued = false;
    try {
      const { proposeSpecUpdate } = await import('../lib/spec-engine.js');
      proposeSpecUpdate(
        `auto/${gateResult.results.find(r => !r.passed && !r.skipped)?.gate ?? 'unknown'}`,
        `# Auto-Detected Quality Pattern\n\n${remediation.learning_signal}`,
        remediation.learning_signal,
        { source: 'ralph-loop', learningSignal: remediation.learning_signal }
      );
      proposalQueued = true;
      remediationLog[remediationLog.length - 1].proposal_queued = true;
    } catch { /* spec engine may not be ready */ }

    // Write updated ralph state
    writeRalphState({ retries, lastUpdated: new Date().toISOString(), remediation_log: remediationLog });

    // Build correction prompt from structured payload
    const correctionPrompt = buildRemediationPrompt(rejectionPayload, tier);

    logHook('WARNING', `subagent-stop: gates FAILED (retry ${retries}/${MAX_RETRIES}) | tier=${tier} | violation="${remediation.primary_violation.slice(0, 60)}" | proposal=${proposalQueued}`);

    // Block completion and re-invoke with remediation-injected correction
    process.stdout.write(JSON.stringify({
      action: 'block',
      retry: true,
      message: correctionPrompt,
      retryCount: retries,
      maxRetries: MAX_RETRIES,
      remediation
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
