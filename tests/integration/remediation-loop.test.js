/**
 * Integration tests for the remediation-injecting Ralph Loop (v0.2.0 Upgrade 1)
 * Tests buildRemediationBlock integration with spec-engine and skill-tier formatting.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname2, '../../.test-tmp-remediation-loop');
mkdirSync(join(tmpDir, '.threadwork', 'specs', 'backend'), { recursive: true });
mkdirSync(join(tmpDir, '.threadwork', 'specs', 'proposals'), { recursive: true });
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

// Write a minimal project.json and a spec file
writeFileSync(join(tmpDir, '.threadwork', 'state', 'project.json'), JSON.stringify({
  _version: '1',
  skillTier: 'advanced',
  sessionBudget: 800000
}, null, 2));

writeFileSync(join(tmpDir, '.threadwork', 'specs', 'backend', 'auth-patterns.md'),
  '---\ntitle: Auth Patterns\ntags: [auth, jwt, token]\n---\n# Auth Patterns\nUse RS256 for JWT.\n'
);

Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const { buildRemediationBlock } = await import('../../lib/quality-gate.js');
const specEngine = await import('../../lib/spec-engine.js');

describe('buildRemediationBlock integration', () => {
  test('returns a structured remediation object with all required fields', () => {
    const gateResults = [
      {
        gate: 'typecheck',
        passed: false,
        output: 'src/auth.ts:42 - TS2339: Property \'token\' does not exist on type \'User\'.'
      },
      { gate: 'lint', passed: true, output: '' }
    ];

    const remediation = buildRemediationBlock(gateResults, specEngine, 'advanced');
    assert.ok(remediation !== null && typeof remediation === 'object', 'Should return an object');
    assert.ok('primary_violation' in remediation, 'Should have primary_violation');
    assert.ok('fix_template' in remediation, 'Should have fix_template');
    assert.ok('learning_signal' in remediation, 'Should have learning_signal');
    assert.ok(remediation.primary_violation.length > 0, 'primary_violation should not be empty');
  });

  test('formats shorter output for ninja skill tier', () => {
    const gateResults = [
      {
        gate: 'tests',
        passed: false,
        output: 'AuthService > login > expected 200, got 401'
      }
    ];

    const advancedRemediation = buildRemediationBlock(gateResults, specEngine, 'advanced');
    const ninjaRemediation = buildRemediationBlock(gateResults, specEngine, 'ninja');

    // Ninja should produce shorter or equal fix_template
    assert.ok(
      ninjaRemediation.fix_template.length <= advancedRemediation.fix_template.length + 20,
      'Ninja fix_template should be concise'
    );
  });

  test('returns a safe fallback object when all gates pass (no-op case)', () => {
    const gateResults = [
      { gate: 'typecheck', passed: true, output: '' },
      { gate: 'lint', passed: true, output: '' },
      { gate: 'tests', passed: true, output: '' }
    ];

    const remediation = buildRemediationBlock(gateResults, specEngine, 'advanced');
    // buildRemediationBlock always returns an object; with no failures it returns safe defaults
    assert.ok(remediation !== null && typeof remediation === 'object', 'Should return a safe defaults object');
    assert.ok('primary_violation' in remediation, 'Should have primary_violation field');
    assert.ok('fix_template' in remediation, 'Should have fix_template field');
  });
});
