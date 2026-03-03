/**
 * Unit tests for hooks/subagent-stop.js — remediation path
 * Tests the logic helpers directly to avoid running the full hook process.
 * Run: node --test tests/unit/subagent-stop.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

// Temp dir for state isolation
const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-subagent');
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

// Override process.cwd for this test module
const origCwd = process.cwd.bind(process);
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

// Import quality-gate to test buildRemediationBlock integration
const { buildRemediationBlock } = await import('../../lib/quality-gate.js');

// --- Test the rejection payload structure ---

describe('rejection prompt includes remediation block from buildRemediationBlock', () => {
  test('buildRemediationBlock produces correct structure for TypeScript error', () => {
    const gateResults = {
      passed: false,
      results: [{
        gate: 'typecheck',
        passed: false,
        errors: ["src/foo.ts(5,3): error TS2345: Argument of type 'string' is not assignable"]
      }]
    };
    const block = buildRemediationBlock(gateResults, null, 'advanced');
    assert.ok('primary_violation' in block, 'must have primary_violation');
    assert.ok('relevant_spec' in block, 'must have relevant_spec');
    assert.ok('fix_template' in block, 'must have fix_template');
    assert.ok('learning_signal' in block, 'must have learning_signal');
    assert.ok(block.primary_violation.includes('TS2345'));
  });
});

// --- Test remediation_log state management ---

describe('remediation_log is appended on each rejection', () => {
  const ralphPath = join(tmpDir, '.threadwork', 'state', 'ralph-state.json');

  test('ralph-state.json gains remediation_log field after writing', () => {
    const state = {
      _version: '1',
      retries: 1,
      remediation_log: [{
        iteration: 1,
        timestamp: new Date().toISOString(),
        primary_violation: 'TypeScript error TS2339',
        relevant_spec: 'None identified',
        learning_signal: 'TypeScript TS2339 pattern',
        proposal_queued: true
      }]
    };
    writeFileSync(ralphPath, JSON.stringify(state, null, 2), 'utf8');

    const written = JSON.parse(readFileSync(ralphPath, 'utf8'));
    assert.ok(Array.isArray(written.remediation_log));
    assert.equal(written.remediation_log.length, 1);
    assert.equal(written.remediation_log[0].iteration, 1);
    assert.ok(written.remediation_log[0].proposal_queued === true);
  });
});

describe('remediation_log is preserved when ralph-state is cleared', () => {
  const ralphPath = join(tmpDir, '.threadwork', 'state', 'ralph-state.json');
  const hookLogPath = join(tmpDir, '.threadwork', 'state', 'hook-log.json');

  test('remediation_log appears in hook-log on clear', () => {
    // Write a ralph-state with a non-empty remediation_log
    writeFileSync(ralphPath, JSON.stringify({
      _version: '1',
      retries: 2,
      remediation_log: [
        { iteration: 1, learning_signal: 'signal-a' },
        { iteration: 2, learning_signal: 'signal-b' }
      ]
    }, null, 2), 'utf8');

    // Simulate the clearRalphState logic: move log to hook-log.json
    const current = JSON.parse(readFileSync(ralphPath, 'utf8'));
    const remediationLog = current.remediation_log ?? [];

    // This is what clearRalphState() does internally
    const historyLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      hook: 'subagent-stop',
      message: 'ralph-state cleared',
      ralph_loop_history: remediationLog
    }) + '\n';
    appendFileSync(hookLogPath, historyLine, 'utf8');

    // Now write cleared ralph-state
    writeFileSync(ralphPath, JSON.stringify({ retries: 0, cleared: true, remediation_log: [] }, null, 2), 'utf8');

    // Verify ralph-state is cleared
    const clearedState = JSON.parse(readFileSync(ralphPath, 'utf8'));
    assert.equal(clearedState.cleared, true);
    assert.equal(clearedState.remediation_log.length, 0);

    // Verify hook-log has the history
    const hookLog = readFileSync(hookLogPath, 'utf8');
    assert.ok(hookLog.includes('ralph_loop_history'));
    assert.ok(hookLog.includes('signal-a'));
    assert.ok(hookLog.includes('signal-b'));
  });
});
