/**
 * Integration tests for spec enforcement pipeline:
 * spec-engine.loadRulesFromSpecs + rule-evaluator.evaluateRules
 * Run: node --test tests/integration/spec-enforcement.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let loadRulesFromSpecs;
let evaluateRules;

before(async () => {
  tmpDir = join(tmpdir(), `tw-spec-enforcement-test-${Date.now()}`);
  mkdirSync(join(tmpDir, '.threadwork', 'specs', 'enforcement'), { recursive: true });
  mkdirSync(join(tmpDir, '.threadwork', 'specs', 'general'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'services'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'ui'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'hooks'), { recursive: true });

  // Write enforcement spec with rules
  writeFileSync(join(tmpDir, '.threadwork', 'specs', 'enforcement', 'phase-1-rules.md'), [
    '---',
    'specId: SPEC:enf-001',
    'name: Phase 1 Rules',
    'domain: enforcement',
    'rules:',
    '  - type: grep_must_not_exist',
    "    pattern: 'console\\.log'",
    '    files: "src/**/*.ts"',
    '    message: "No console.log in src/ (SPEC:enf-001)"',
    '  - type: naming_pattern',
    '    pattern: "^use[A-Z]"',
    '    files: "src/hooks/**/*.ts"',
    '    target: "export_names"',
    '    message: "Hooks must start with use (SPEC:enf-001)"',
    '---',
    '',
    '# Phase 1 Enforcement Rules'
  ].join('\n'));

  // Write general spec (no rules)
  writeFileSync(join(tmpDir, '.threadwork', 'specs', 'general', 'architecture.md'), [
    '---',
    'specId: SPEC:gen-001',
    'name: Architecture Spec',
    'domain: general',
    '---',
    '',
    '# Architecture'
  ].join('\n'));

  // Write compliant source files
  writeFileSync(join(tmpDir, 'src', 'hooks', 'useAuth.ts'), 'export function useAuth() { return {}; }');
  writeFileSync(join(tmpDir, 'src', 'services', 'auth.ts'), 'export class AuthService { login() {} }');

  // Write violating source file
  writeFileSync(join(tmpDir, 'src', 'ui', 'button.ts'), 'export function renderButton() { console.log("rendered"); }');

  const origCwd = process.cwd;
  Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

  const specMod = await import('../../lib/spec-engine.js');
  loadRulesFromSpecs = specMod.loadRulesFromSpecs;

  const evalMod = await import('../../lib/rule-evaluator.js');
  evaluateRules = evalMod.evaluateRules;

  Object.defineProperty(process, 'cwd', { value: origCwd, configurable: true });
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('spec enforcement pipeline', () => {
  test('loadRulesFromSpecs finds rules in enforcement specs', () => {
    const rules = loadRulesFromSpecs(join(tmpDir, '.threadwork', 'specs'));
    assert.ok(rules.length >= 2);
    assert.ok(rules.every(r => r.specId === 'SPEC:enf-001'));
  });

  test('loadRulesFromSpecs ignores specs without rules', () => {
    const rules = loadRulesFromSpecs(join(tmpDir, '.threadwork', 'specs'));
    assert.ok(!rules.some(r => r.specId === 'SPEC:gen-001'));
  });

  test('evaluateRules catches console.log violation', async () => {
    const rules = loadRulesFromSpecs(join(tmpDir, '.threadwork', 'specs'));
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    const consoleViolation = result.violations.find(v => v.message.includes('console.log'));
    assert.ok(consoleViolation);
    assert.ok(consoleViolation.specId === 'SPEC:enf-001');
  });

  test('full pipeline identifies all violations', async () => {
    const rules = loadRulesFromSpecs(join(tmpDir, '.threadwork', 'specs'));
    const result = await evaluateRules(rules, tmpDir);
    assert.ok(result.violations.length >= 1);
    assert.ok(result.violations.every(v => typeof v.specId === 'string'));
    assert.ok(result.violations.every(v => typeof v.message === 'string'));
  });
});
