/**
 * Unit tests for lib/rule-evaluator.js
 * Run: node --test tests/unit/rule-evaluator.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let evaluateRules;

before(async () => {
  tmpDir = join(tmpdir(), `tw-rule-eval-test-${Date.now()}`);
  mkdirSync(join(tmpDir, 'src', 'hooks'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'utils'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'ui'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'services'), { recursive: true });

  writeFileSync(join(tmpDir, 'src', 'hooks', 'useAuth.ts'), 'export function useAuth() { return {}; }\n');
  writeFileSync(join(tmpDir, 'src', 'hooks', 'fetchData.ts'), 'export function fetchData() { return null; }\n');
  writeFileSync(join(tmpDir, 'src', 'utils', 'logger.ts'), 'export function log(msg) { console.log(msg); }\n');
  writeFileSync(join(tmpDir, 'src', 'services', 'auth.service.ts'), "import { Button } from '../ui/button';\nexport class AuthService {}\n");
  writeFileSync(join(tmpDir, 'src', 'ui', 'button.ts'), 'export class Button {}\n');

  // Patch cwd for the module
  const origCwd = process.cwd;
  Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

  const mod = await import('../../lib/rule-evaluator.js');
  evaluateRules = mod.evaluateRules;

  Object.defineProperty(process, 'cwd', { value: origCwd, configurable: true });
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('evaluateRules', () => {
  test('grep_must_exist — passes when pattern found', async () => {
    const rules = [{
      type: 'grep_must_exist',
      pattern: 'export function useAuth',
      files: 'src/hooks/**/*.ts',
      message: 'useAuth hook must exist',
      specId: 'SPEC:test-001'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, true);
    assert.equal(result.violations.length, 0);
  });

  test('grep_must_exist — fails when pattern not found', async () => {
    const rules = [{
      type: 'grep_must_exist',
      pattern: 'data-testid=',
      files: 'src/**/*.ts',
      message: 'data-testid must be present',
      specId: 'SPEC:test-001'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    assert.equal(result.violations.length, 1);
    assert.ok(result.violations[0].message.includes('data-testid'));
  });

  test('grep_must_not_exist — passes when pattern absent', async () => {
    const rules = [{
      type: 'grep_must_not_exist',
      pattern: 'eval\\(',
      files: 'src/**/*.ts',
      message: 'No eval() allowed',
      specId: 'SPEC:test-002'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, true);
  });

  test('grep_must_not_exist — fails when forbidden pattern found', async () => {
    const rules = [{
      type: 'grep_must_not_exist',
      pattern: 'console\\.log',
      files: 'src/**/*.ts',
      message: 'No console.log',
      specId: 'SPEC:test-002'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    assert.ok(result.violations.length >= 1);
    assert.ok(result.violations[0].evidence.length > 0);
  });

  test('naming_pattern — passes when all exports match', async () => {
    const rules = [{
      type: 'naming_pattern',
      pattern: '^use[A-Z]',
      files: 'src/hooks/useAuth.ts',
      target: 'export_names',
      message: 'Hooks must start with use',
      specId: 'SPEC:test-003'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, true);
  });

  test('naming_pattern — fails when export does not match', async () => {
    const rules = [{
      type: 'naming_pattern',
      pattern: '^use[A-Z]',
      files: 'src/hooks/**/*.ts',
      target: 'export_names',
      message: 'Hooks must start with use',
      specId: 'SPEC:test-003'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    // fetchData does not start with use
    assert.ok(result.violations.some(v => v.evidence.includes('fetchData')));
  });

  test('file_structure — passes when required file exists', async () => {
    const rules = [{
      type: 'file_structure',
      must_exist: ['src/hooks/useAuth.ts'],
      message: 'useAuth must exist',
      specId: 'SPEC:test-004'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, true);
  });

  test('file_structure — fails when required file missing', async () => {
    const rules = [{
      type: 'file_structure',
      must_exist: ['src/index.ts'],
      message: 'src/index.ts must exist',
      specId: 'SPEC:test-004'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    assert.ok(result.violations[0].message.includes('src/index.ts'));
  });

  test('import_boundary — fails when service imports from ui', async () => {
    const rules = [{
      type: 'import_boundary',
      from: 'src/services/**',
      cannot_import: ['src/ui/**'],
      message: 'Services cannot import from UI',
      specId: 'SPEC:test-005'
    }];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    assert.ok(result.violations.length >= 1);
  });

  test('multiple rules — aggregates violations', async () => {
    const rules = [
      {
        type: 'grep_must_not_exist',
        pattern: 'console\\.log',
        files: 'src/**/*.ts',
        message: 'No console.log',
        specId: 'SPEC:test-001'
      },
      {
        type: 'file_structure',
        must_exist: ['src/nonexistent.ts'],
        message: 'Must have nonexistent.ts',
        specId: 'SPEC:test-002'
      }
    ];
    const result = await evaluateRules(rules, tmpDir);
    assert.equal(result.passed, false);
    assert.ok(result.violations.length >= 2);
  });

  test('unknown rule type — skips gracefully', async () => {
    const rules = [{
      type: 'unknown_rule_type',
      message: 'Unknown',
      specId: 'SPEC:test-999'
    }];
    const result = await evaluateRules(rules, tmpDir);
    // Unknown rules should pass (not fail with an exception)
    assert.equal(typeof result.passed, 'boolean');
    assert.ok(Array.isArray(result.violations));
  });
});
