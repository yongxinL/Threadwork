/**
 * Unit tests for lib/state.js — v0.2.0 decision log additions
 * Run: node --test tests/unit/state-decisions.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-state-decisions');
mkdirSync(join(tmpDir, '.threadwork', 'state', 'phases', 'phase-1', 'plans'), { recursive: true });

// Override process.cwd for this test module
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

// Write a minimal v0.2.0 plan XML
const planXml = `<plan id="PLAN-1-1" phase="1" milestone="1">
  <title>Test Plan</title>
  <tasks>
    <task id="T-1-1-1">
      <description>Test task</description>
      <files>src/test.ts</files>
      <verification>tsc --noEmit passes</verification>
      <done-condition>Tests pass</done-condition>
      <status>IN_PROGRESS</status>
    </task>
  </tasks>
</plan>`;

const planPath = join(tmpDir, '.threadwork', 'state', 'phases', 'phase-1', 'plans', 'PLAN-1-1.xml');
writeFileSync(planPath, planXml, 'utf8');

// Also write a v0.1.x plan (no <decisions> block, no project.json needed)
writeFileSync(
  join(tmpDir, '.threadwork', 'state', 'phases', 'phase-1', 'plans', 'PLAN-1-0.xml'),
  `<plan id="PLAN-1-0"><title>Old Plan</title><tasks></tasks></plan>`,
  'utf8'
);

// Import state module
const { appendDecision, readDecisions, readSessionDecisions } = await import('../../lib/state.js');

describe('appendDecision', () => {
  test('adds well-formed <decision> element to plan XML', () => {
    appendDecision('PLAN-1-1', 'T-1-1-1', {
      choice: 'Used RS256 instead of HS256',
      rationale: 'External services need public-key verification.',
      alternativesConsidered: 'HS256 (rejected: secret sharing required)'
    });

    const updated = readFileSync(planPath, 'utf8');
    assert.ok(updated.includes('<decisions>'), 'Should have <decisions> block');
    assert.ok(updated.includes('<decision task="T-1-1-1"'), 'Should reference task T-1-1-1');
    assert.ok(updated.includes('RS256'), 'Should contain choice text');
    assert.ok(updated.includes('External services'), 'Should contain rationale');
    assert.ok(updated.includes('HS256'), 'Should contain alternatives');
  });

  test('creates <decisions> block if absent, then appends to it on second call', () => {
    appendDecision('PLAN-1-1', 'T-1-1-1', {
      choice: 'Set access token expiry to 15 minutes',
      rationale: 'Follows OWASP recommendation for sensitive data.',
    });

    const updated = readFileSync(planPath, 'utf8');
    // Should have exactly one <decisions> block
    const decisionsCount = (updated.match(/<decisions>/g) ?? []).length;
    assert.equal(decisionsCount, 1, 'Should have exactly one <decisions> block');

    // Should have two <decision> elements now
    const decisionCount = (updated.match(/<decision task=/g) ?? []).length;
    assert.ok(decisionCount >= 2, `Expected at least 2 <decision> elements, got ${decisionCount}`);
  });
});

describe('readDecisions', () => {
  test('returns array of decision objects for plan with decisions', () => {
    const decisions = readDecisions('PLAN-1-1');
    assert.ok(Array.isArray(decisions));
    assert.ok(decisions.length >= 2, `Expected >= 2 decisions, got ${decisions.length}`);
    assert.ok('choice' in decisions[0], 'Decision should have choice field');
    assert.ok('rationale' in decisions[0], 'Decision should have rationale field');
    assert.ok('taskId' in decisions[0], 'Decision should have taskId field');
    assert.ok('timestamp' in decisions[0], 'Decision should have timestamp field');
  });

  test('returns empty array for plan with no <decisions> block (v0.1.x backward compat)', () => {
    const decisions = readDecisions('PLAN-1-0');
    assert.equal(decisions.length, 0, 'v0.1.x plan should return empty array');
  });
});

describe('readSessionDecisions', () => {
  test('returns empty array for unknown SHA', () => {
    const decisions = readSessionDecisions('unknown');
    assert.ok(Array.isArray(decisions));
    assert.equal(decisions.length, 0);
  });

  test('returns empty array for null SHA', () => {
    const decisions = readSessionDecisions(null);
    assert.ok(Array.isArray(decisions));
    assert.equal(decisions.length, 0);
  });
});
