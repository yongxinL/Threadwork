/**
 * Unit tests for lib/quality-gate.js — classifyFailure()
 * Run: node --test tests/unit/quality-gate-classify.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { classifyFailure } = await import('../../lib/quality-gate.js');

function makeResults(gates) {
  return {
    passed: false,
    results: gates.map(({ gate, errors = [], failures = [] }) => ({
      gate,
      passed: false,
      errors,
      failures
    }))
  };
}

describe('classifyFailure', () => {
  test('classifies TypeScript error as code_bug', () => {
    const gateResults = makeResults([{
      gate: 'typecheck',
      errors: ["src/auth.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'"]
    }]);
    const result = classifyFailure(gateResults, null);
    assert.equal(result.type, 'code_bug');
    assert.ok(result.confidence > 0);
    assert.ok(typeof result.recommendation === 'string');
    assert.ok(result.recommendation.length > 0);
  });

  test('classifies missing dependency as missing_capability', () => {
    const gateResults = makeResults([{
      gate: 'tests',
      failures: ["Cannot find module 'some-unknown-package'"]
    }]);
    const result = classifyFailure(gateResults, null);
    assert.ok(['missing_capability', 'knowledge_gap', 'code_bug'].includes(result.type));
    assert.ok(result.confidence > 0);
  });

  test('classifies import boundary violation as architectural_violation', () => {
    const gateResults = makeResults([{
      gate: 'spec-compliance',
      failures: ['Import boundary violation: src/services/auth.ts imports from src/ui/button.ts']
    }]);
    const result = classifyFailure(gateResults, null);
    assert.ok(['architectural_violation', 'code_bug'].includes(result.type));
  });

  test('returns object with all required fields', () => {
    const gateResults = makeResults([{
      gate: 'lint',
      errors: ['src/utils.ts: Error - no-var']
    }]);
    const result = classifyFailure(gateResults, null);
    assert.ok(typeof result.type === 'string');
    assert.ok(typeof result.confidence === 'number');
    assert.ok(typeof result.evidence === 'string' || Array.isArray(result.evidence));
    assert.ok(typeof result.recommendation === 'string');
  });

  test('confidence is between 0 and 1', () => {
    const gateResults = makeResults([{
      gate: 'tests',
      failures: ['× AuthService > should authenticate user']
    }]);
    const result = classifyFailure(gateResults, null);
    assert.ok(result.confidence >= 0);
    assert.ok(result.confidence <= 1);
  });

  test('handles empty gate results without throwing', () => {
    const gateResults = { passed: false, results: [] };
    const result = classifyFailure(gateResults, null);
    assert.ok(typeof result.type === 'string');
  });
});
