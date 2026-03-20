/**
 * Unit tests for lib/verification-profile.js
 * Run: node --test tests/unit/verification-profile.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let loadProfile, runProfileChecks;

before(async () => {
  tmpDir = join(tmpdir(), `tw-verification-profile-test-${Date.now()}`);
  mkdirSync(join(tmpDir, 'dist'), { recursive: true });
  mkdirSync(join(tmpDir, 'src'), { recursive: true });

  // Create mock output files
  writeFileSync(join(tmpDir, 'dist', 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Test Extension',
    version: '1.0.0'
  }));

  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    scripts: { build: 'echo build', start: 'echo start' }
  }));

  const mod = await import('../../lib/verification-profile.js');
  loadProfile = mod.loadProfile;
  runProfileChecks = mod.runProfileChecks;
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadProfile', () => {
  // loadProfile(projectJson) reads from projectJson.verification, not verificationType
  test('loads profile from projectJson.verification object', () => {
    const projectJson = {
      verification: {
        type: 'browser-extension',
        automated: [{ type: 'file_exists', description: 'Manifest', files: ['dist/manifest.json'], blocking: true }],
        manual: [{ description: 'Load in Chrome', expected: 'Works', critical: true }]
      }
    };
    const profile = loadProfile(projectJson);
    assert.ok(profile);
    assert.equal(profile.type, 'browser-extension');
    assert.ok(Array.isArray(profile.automated));
    assert.ok(Array.isArray(profile.manual));
  });

  test('returns null when no verification key in projectJson', () => {
    const profile = loadProfile({ verificationType: 'browser-extension' });
    assert.equal(profile, null);
  });

  test('returns null when verification.type is unknown', () => {
    const profile = loadProfile({ verification: { type: 'unknown-type', automated: [], manual: [] } });
    assert.equal(profile, null);
  });

  test('returns null when projectJson is empty', () => {
    const profile = loadProfile({});
    assert.equal(profile, null);
  });

  test('accepts custom profile type', () => {
    const projectJson = {
      verification: {
        type: 'custom',
        automated: [],
        manual: [{ description: 'Test manually', expected: 'Works', critical: true }]
      }
    };
    const profile = loadProfile(projectJson);
    assert.ok(profile);
    assert.equal(profile.type, 'custom');
    assert.equal(profile.manual.length, 1);
  });
});

describe('runProfileChecks', () => {
  test('file_exists check passes when file exists', async () => {
    const profile = {
      type: 'test',
      automated: [{
        type: 'file_exists',
        description: 'Manifest exists',
        files: ['dist/manifest.json'],
        blocking: true
      }],
      manual: []
    };

    const { results } = runProfileChecks(profile, tmpDir);
    const check = results.find(r => r.description === 'Manifest exists');
    assert.ok(check);
    assert.equal(check.passed, true);
  });

  test('file_exists check fails when file missing', async () => {
    const profile = {
      type: 'test',
      automated: [{
        type: 'file_exists',
        description: 'Missing file check',
        files: ['dist/nonexistent.js'],
        blocking: true
      }],
      manual: []
    };

    const { results } = runProfileChecks(profile, tmpDir);
    const check = results.find(r => r.description === 'Missing file check');
    assert.ok(check);
    assert.equal(check.passed, false);
  });

  test('json_schema check passes with required keys', async () => {
    const profile = {
      type: 'test',
      automated: [{
        type: 'json_schema',
        description: 'Manifest has required fields',
        file: 'dist/manifest.json',
        required_keys: ['manifest_version', 'name', 'version'],
        blocking: true
      }],
      manual: []
    };

    const { results } = runProfileChecks(profile, tmpDir);
    const check = results.find(r => r.description === 'Manifest has required fields');
    assert.ok(check);
    assert.equal(check.passed, true);
  });

  test('json_schema check fails when key missing', async () => {
    const profile = {
      type: 'test',
      automated: [{
        type: 'json_schema',
        description: 'Check missing key',
        file: 'dist/manifest.json',
        required_keys: ['manifest_version', 'permissions'],
        blocking: true
      }],
      manual: []
    };

    const { results } = runProfileChecks(profile, tmpDir);
    const check = results.find(r => r.description === 'Check missing key');
    assert.ok(check);
    assert.equal(check.passed, false);
  });

  test('returns empty results for profile with no automated checks', async () => {
    const profile = {
      type: 'test',
      automated: [],
      manual: [{ description: 'Manual only', expected: 'Works', critical: true }]
    };

    const { results } = runProfileChecks(profile, tmpDir);
    assert.deepEqual(results, []);
  });

  test('no_forbidden_patterns check passes when pattern absent', async () => {
    const profile = {
      type: 'test',
      automated: [{
        type: 'no_forbidden_patterns',
        description: 'No eval in dist',
        files: ['dist/**/*.json'],
        patterns: ['eval\\('],
        blocking: false
      }],
      manual: []
    };

    const { results } = runProfileChecks(profile, tmpDir);
    const check = results.find(r => r.description === 'No eval in dist');
    assert.ok(check);
    assert.equal(check.passed, true);
  });
});
