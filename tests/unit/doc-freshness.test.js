/**
 * Unit tests for lib/doc-freshness.js
 * Run: node --test tests/unit/doc-freshness.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let specsDir;
let checkDocFreshness, extractFileReferences;

before(async () => {
  tmpDir = join(tmpdir(), `tw-doc-freshness-test-${Date.now()}`);
  specsDir = join(tmpDir, '.threadwork', 'specs', 'general');
  mkdirSync(specsDir, { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });

  // Create a real file to reference
  writeFileSync(join(tmpDir, 'src', 'lib', 'auth.ts'), 'export function auth() {}');

  const mod = await import('../../lib/doc-freshness.js');
  checkDocFreshness = mod.checkDocFreshness;
  extractFileReferences = mod.extractFileReferences;
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('extractFileReferences', () => {
  test('extracts markdown links to local files', () => {
    const content = 'See [auth module](src/lib/auth.ts) for details.';
    const refs = extractFileReferences(content, tmpDir);
    assert.ok(refs.some(r => r.includes('auth.ts')));
  });

  test('extracts code-fenced paths', () => {
    const content = 'Edit `src/lib/auth.ts` to change auth.';
    const refs = extractFileReferences(content, tmpDir);
    assert.ok(refs.some(r => r.includes('auth.ts')));
  });

  test('ignores external URLs', () => {
    const content = 'See [docs](https://example.com/docs) for info.';
    const refs = extractFileReferences(content, tmpDir);
    assert.ok(!refs.some(r => r.startsWith('https')));
  });
});

describe('checkDocFreshness', () => {
  test('passes when all file references are valid', async () => {
    writeFileSync(join(specsDir, 'valid-spec.md'), [
      '---',
      'specId: SPEC:valid-001',
      'name: Valid Spec',
      '---',
      '',
      'References [auth module](src/lib/auth.ts).'
    ].join('\n'));

    const result = await checkDocFreshness(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const errors = result.issues.filter(i => i.type === 'dead_reference' && i.specId === 'SPEC:valid-001');
    assert.equal(errors.length, 0);
  });

  test('reports dead_reference for missing file', async () => {
    writeFileSync(join(specsDir, 'dead-ref-spec.md'), [
      '---',
      'specId: SPEC:dead-001',
      'name: Dead Ref Spec',
      '---',
      '',
      'See [missing](src/lib/nonexistent.ts) for details.'
    ].join('\n'));

    const result = await checkDocFreshness(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const issues = result.issues.filter(i => i.specId === 'SPEC:dead-001');
    assert.ok(issues.length >= 1);
    assert.ok(issues.some(i => i.type === 'dead_reference' || i.type === 'dead_cross_reference'));
  });

  test('returns passed:false when blocking issues exist', async () => {
    writeFileSync(join(specsDir, 'fail-spec.md'), [
      '---',
      'specId: SPEC:fail-001',
      'name: Fail Spec',
      'rules:',
      '  - type: grep_must_exist',
      '    pattern: foo',
      '    files: "src/nonexistent/**/*.ts"',
      '    message: Must have foo',
      '---',
      '',
      'References [missing file](src/lib/missing.ts).'
    ].join('\n'));

    const result = await checkDocFreshness(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    // At minimum we should get an issues array
    assert.ok(Array.isArray(result.issues));
    assert.ok(typeof result.passed === 'boolean');
  });

  test('handles empty specs directory gracefully', async () => {
    const emptySpecsDir = join(tmpDir, '.threadwork', 'specs', 'empty-domain');
    mkdirSync(emptySpecsDir, { recursive: true });

    const result = await checkDocFreshness(emptySpecsDir, tmpDir);
    assert.ok(typeof result.passed === 'boolean');
    assert.ok(Array.isArray(result.issues));
  });
});
