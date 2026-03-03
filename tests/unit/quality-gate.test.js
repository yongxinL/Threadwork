/**
 * Unit tests for lib/quality-gate.js — buildRemediationBlock()
 * Run: node --test tests/unit/quality-gate.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { buildRemediationBlock } = await import('../../lib/quality-gate.js');

// Helper: build a minimal gateResults object with one failing gate
function makeGateResult(gate, errors = [], failures = []) {
  const result = { gate, passed: false };
  if (errors.length) result.errors = errors;
  if (failures.length) result.failures = failures;
  return { passed: false, results: [result] };
}

describe('buildRemediationBlock', () => {
  test('returns structured payload for TypeScript error', () => {
    const gateResults = makeGateResult('typecheck', [
      "src/auth.ts(42,5): error TS2339: Property 'token' does not exist on type 'User'"
    ]);
    const block = buildRemediationBlock(gateResults, null, 'advanced');

    assert.ok(block.primary_violation.includes('TS2339'));
    assert.ok(block.fix_template.includes('src/auth.ts'));
    assert.ok(typeof block.learning_signal === 'string');
    assert.ok(block.learning_signal.length > 0);
    assert.ok(typeof block.relevant_spec === 'string');
  });

  test('returns structured payload for lint error', () => {
    const gateResults = makeGateResult('lint', [
      'src/utils.ts: line 10, col 5, Error - Unexpected var. (no-var)'
    ]);
    const block = buildRemediationBlock(gateResults, null, 'advanced');

    assert.ok(block.primary_violation.includes('no-var'));
    assert.ok(block.fix_template.includes('no-var'));
    assert.ok(block.learning_signal.includes('no-var'));
  });

  test('returns structured payload for test failure', () => {
    const gateResults = makeGateResult('tests', [], ['× AuthService > should refresh token']);
    const block = buildRemediationBlock(gateResults, null, 'advanced');

    assert.ok(block.primary_violation.toLowerCase().includes('test'));
    assert.ok(block.fix_template.length > 0);
  });

  test('formats fix_template differently per skill tier', () => {
    const gateResults = makeGateResult('typecheck', [
      "src/api.ts(10,3): error TS2551: Property 'x' does not exist on type 'Y'"
    ]);

    const beginner = buildRemediationBlock(gateResults, null, 'beginner');
    const ninja = buildRemediationBlock(gateResults, null, 'ninja');
    const advanced = buildRemediationBlock(gateResults, null, 'advanced');

    // Beginner should have the most verbose explanation
    assert.ok(beginner.fix_template.length >= advanced.fix_template.length || beginner.fix_template.includes('\n'));
    // Ninja should be most concise
    assert.ok(ninja.fix_template.length <= advanced.fix_template.length + 20);
  });

  test('uses spec engine findRelatedSpec when provided', () => {
    const gateResults = makeGateResult('typecheck', [
      "src/auth.ts(1,1): error TS2339: Property 'jwt' does not exist"
    ]);

    const mockSpecEngine = {
      findRelatedSpec: (msg) => {
        if (msg.includes('jwt') || msg.includes('auth')) return 'SPEC:auth-001  backend/auth-patterns';
        return null;
      }
    };

    const block = buildRemediationBlock(gateResults, mockSpecEngine, 'advanced');
    assert.ok(block.relevant_spec.includes('auth'));
  });

  test('returns safe defaults when gateResults has no failures', () => {
    const block = buildRemediationBlock({ passed: true, results: [] }, null, 'advanced');
    assert.ok(typeof block.primary_violation === 'string');
    assert.ok(typeof block.fix_template === 'string');
  });
});
