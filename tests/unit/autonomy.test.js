/**
 * Unit tests for lib/autonomy.js
 * Run: node --test tests/unit/autonomy.test.js
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmpDir = join(tmpdir(), `tw-autonomy-test-${Date.now()}`);
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

function writeProjectJson(data) {
  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'project.json'),
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

// Keep cwd patched throughout — getAutonomyLevel uses process.cwd()
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

writeProjectJson({ name: 'test', autonomyLevel: 'supervised' });

const {
  getAutonomyLevel,
  getMaxRetries,
  getAutoAcceptThreshold,
  isSafetyRail,
  shouldAutoApprovePlan,
  shouldAutoFillDiscuss,
  shouldDeferManualVerification,
  shouldAutoChainSessions
} = await import('../../lib/autonomy.js');

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('getAutonomyLevel', () => {
  test('reads autonomyLevel from project.json', () => {
    writeProjectJson({ name: 'test', autonomyLevel: 'guided' });
    assert.equal(getAutonomyLevel(), 'guided');
  });

  test('reads autonomous level', () => {
    writeProjectJson({ name: 'test', autonomyLevel: 'autonomous' });
    assert.equal(getAutonomyLevel(), 'autonomous');
  });

  test('defaults to supervised when autonomyLevel not set', () => {
    writeProjectJson({ name: 'test' });
    assert.equal(getAutonomyLevel(), 'supervised');
  });

  test('defaults to supervised for unknown level', () => {
    writeProjectJson({ name: 'test', autonomyLevel: 'ultra' });
    assert.equal(getAutonomyLevel(), 'supervised');
  });
});

describe('getMaxRetries', () => {
  test('supervised returns 5', () => {
    assert.equal(getMaxRetries('supervised'), 5);
  });

  test('guided returns 8', () => {
    assert.equal(getMaxRetries('guided'), 8);
  });

  test('autonomous returns 10', () => {
    assert.equal(getMaxRetries('autonomous'), 10);
  });

  test('unknown level returns supervised default (5)', () => {
    assert.equal(getMaxRetries('unknown'), 5);
  });
});

describe('getAutoAcceptThreshold', () => {
  test('supervised returns 0.7', () => {
    assert.equal(getAutoAcceptThreshold('supervised'), 0.7);
  });

  test('guided returns 0.6', () => {
    assert.equal(getAutoAcceptThreshold('guided'), 0.6);
  });

  test('autonomous returns 0.5', () => {
    assert.equal(getAutoAcceptThreshold('autonomous'), 0.5);
  });
});

describe('isSafetyRail', () => {
  test('identifies git push as safety rail', () => {
    assert.equal(isSafetyRail('git push origin main'), true);
  });

  test('identifies force push as safety rail', () => {
    assert.equal(isSafetyRail('git push --force'), true);
  });

  test('identifies rm -rf as safety rail', () => {
    assert.equal(isSafetyRail('rm -rf /'), true);
  });

  test('identifies DROP TABLE as safety rail', () => {
    assert.equal(isSafetyRail('DROP TABLE users'), true);
  });

  test('identifies security keyword as safety rail', () => {
    assert.equal(isSafetyRail('change security settings'), true);
  });

  test('identifies budget exceed as safety rail', () => {
    assert.equal(isSafetyRail('budget exceed by 20%'), true);
  });

  test('does not flag normal operations', () => {
    assert.equal(isSafetyRail('npm run build'), false);
    assert.equal(isSafetyRail('run tests'), false);
    assert.equal(isSafetyRail('edit src/auth.ts'), false);
    assert.equal(isSafetyRail('npm install'), false);
  });
});

describe('shouldAutoApprovePlan', () => {
  test('supervised always returns false', () => {
    assert.equal(shouldAutoApprovePlan('supervised', { passed: true, issues: [] }), false);
  });

  test('guided always returns false (only autonomous auto-approves)', () => {
    assert.equal(shouldAutoApprovePlan('guided', { passed: true, issues: [] }), false);
  });

  test('autonomous returns true when checkReport passed with no issues', () => {
    assert.equal(shouldAutoApprovePlan('autonomous', { passed: true, issues: [] }), true);
  });

  test('autonomous returns false when checkReport has issues', () => {
    assert.equal(shouldAutoApprovePlan('autonomous', { passed: true, issues: ['some issue'] }), false);
  });

  test('autonomous returns false when checkReport not passed', () => {
    assert.equal(shouldAutoApprovePlan('autonomous', { passed: false, issues: [] }), false);
  });

  test('autonomous returns false when no checkReport', () => {
    assert.equal(shouldAutoApprovePlan('autonomous', undefined), false);
  });
});

describe('shouldDeferManualVerification', () => {
  test('supervised returns false', () => {
    assert.equal(shouldDeferManualVerification('supervised'), false);
  });

  test('guided returns false', () => {
    assert.equal(shouldDeferManualVerification('guided'), false);
  });

  test('autonomous returns true', () => {
    assert.equal(shouldDeferManualVerification('autonomous'), true);
  });
});

describe('shouldAutoChainSessions', () => {
  test('supervised returns false', () => {
    assert.equal(shouldAutoChainSessions('supervised'), false);
  });

  test('guided returns false', () => {
    assert.equal(shouldAutoChainSessions('guided'), false);
  });

  test('autonomous returns true', () => {
    assert.equal(shouldAutoChainSessions('autonomous'), true);
  });
});
