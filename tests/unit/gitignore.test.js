/**
 * Unit tests for install/claude-code.js writeGitignoreBlock()
 * Run: node --test tests/unit/gitignore.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const { writeGitignoreBlock } = await import('../../install/claude-code.js');

function makeTmpDir() {
  const dir = join(tmpdir(), `tw-gitignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('writeGitignoreBlock', () => {
  test('creates .gitignore if absent', () => {
    const dir = makeTmpDir();
    assert.ok(!existsSync(join(dir, '.gitignore')));
    writeGitignoreBlock(dir);
    assert.ok(existsSync(join(dir, '.gitignore')));
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    assert.ok(content.includes('# Threadwork — operational state'));
    assert.ok(content.includes('# End Threadwork operational state'));
    assert.ok(content.includes('.threadwork/state/checkpoint.json'));
    assert.ok(content.includes('.threadwork/worktrees/'));
    assert.ok(content.includes('.threadwork/backup/'));
    assert.ok(content.includes('.threadwork/state/model-switch-log.json'));
    assert.ok(content.includes('.threadwork/state/blueprint-migration.json'));
  });

  test('appends to existing .gitignore', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.env\n', 'utf8');
    writeGitignoreBlock(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    assert.ok(content.includes('node_modules/'));
    assert.ok(content.includes('.env'));
    assert.ok(content.includes('# Threadwork — operational state'));
  });

  test('idempotent — does not duplicate block', () => {
    const dir = makeTmpDir();
    writeGitignoreBlock(dir);
    writeGitignoreBlock(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    const occurrences = (content.match(/# Threadwork — operational state/g) ?? []).length;
    assert.strictEqual(occurrences, 1);
  });

  test('block ends with BLOCK_END marker', () => {
    const dir = makeTmpDir();
    writeGitignoreBlock(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    assert.ok(content.includes('# End Threadwork operational state'));
  });

  test('handles .gitignore without trailing newline', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, '.gitignore'), 'node_modules/', 'utf8'); // no trailing newline
    writeGitignoreBlock(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    assert.ok(content.includes('node_modules/'));
    assert.ok(content.includes('# Threadwork — operational state'));
  });
});
