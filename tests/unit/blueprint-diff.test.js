/**
 * Unit tests for lib/blueprint-diff.js
 * Run: node --test tests/unit/blueprint-diff.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmpDir = join(tmpdir(), `tw-blueprint-test-${Date.now()}`);
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const {
  loadLatestBlueprint,
  lockBlueprint,
  diffBlueprints,
  mapChangesToPhases,
  estimateMigrationCosts,
  formatDiffReport,
  listBlueprintVersions
} = await import('../../lib/blueprint-diff.js');

describe('loadLatestBlueprint', () => {
  test('returns null when no blueprints stored', () => {
    assert.strictEqual(loadLatestBlueprint(), null);
  });
});

describe('lockBlueprint / loadLatestBlueprint', () => {
  test('creates blueprint-v1 on first lock', () => {
    const content = '# Blueprint v1\n\n## Phase 1\n\nBuild auth.';
    const version = lockBlueprint(content, 'Initial');
    assert.strictEqual(version, 1);
    const loaded = loadLatestBlueprint();
    assert.strictEqual(loaded, content);
  });

  test('increments version on subsequent lock', () => {
    const content = '# Blueprint v2\n\n## Phase 1\n\nBuild auth + analytics.';
    const version = lockBlueprint(content, 'Added analytics');
    assert.ok(version >= 2);
    const loaded = loadLatestBlueprint();
    assert.strictEqual(loaded, content);
  });
});

describe('listBlueprintVersions', () => {
  test('returns array of versions', () => {
    const versions = listBlueprintVersions();
    assert.ok(Array.isArray(versions));
    assert.ok(versions.length >= 1);
    assert.ok(versions[0].version);
    assert.ok(versions[0].file);
    assert.ok(versions[0].date);
  });
});

describe('diffBlueprints', () => {
  test('detects new sections as additive', () => {
    const old = '# Blueprint\n\n## Phase 1\n\nBuild auth.\n';
    const newBp = '# Blueprint\n\n## Phase 1\n\nBuild auth.\n\n## /tw:analytics Command\n\nNew analytics command.';
    const result = diffBlueprints(old, newBp);
    assert.ok(result.additive.length >= 1, `Expected additive changes, got ${result.additive.length}`);
    assert.ok(result.additive[0].id.startsWith('A'));
  });

  test('returns three categories', () => {
    const result = diffBlueprints('# Old\n## Section\n', '# New\n## Section\n## NewSection\n');
    assert.ok('additive' in result);
    assert.ok('modifications' in result);
    assert.ok('structural' in result);
  });

  test('handles empty blueprints gracefully', () => {
    const result = diffBlueprints('', '');
    assert.deepStrictEqual(result, { additive: [], modifications: [], structural: [] });
  });

  test('handles identical blueprints (no changes)', () => {
    const content = '# Blueprint\n\n## Phase 1\n\nBuild auth.\n';
    const result = diffBlueprints(content, content);
    assert.strictEqual(result.additive.length, 0);
  });

  test('each change has required fields', () => {
    const old = '# Blueprint\n';
    const newBp = '# Blueprint\n\n## New Command Section\n\nA new /tw:analytics command.';
    const result = diffBlueprints(old, newBp);
    for (const change of [...result.additive, ...result.modifications, ...result.structural]) {
      assert.ok(change.id, 'Missing id');
      assert.ok(change.description, 'Missing description');
      assert.ok(Array.isArray(change.affected_components), 'Missing affected_components');
      assert.ok(typeof change.estimated_tokens === 'number', 'Missing estimated_tokens');
      assert.ok(typeof change.estimated_cost === 'number', 'Missing estimated_cost');
    }
  });
});

describe('mapChangesToPhases', () => {
  test('returns rework, free, deferred', () => {
    const changes = {
      additive: [{ id: 'A1', description: 'new command', section: 'Commands', affected_components: [], estimated_tokens: 5000, estimated_cost: 0.10 }],
      modifications: [],
      structural: []
    };
    const projectState = { currentPhase: 2 };
    const result = mapChangesToPhases(changes, projectState);
    assert.ok('rework' in result);
    assert.ok('free' in result);
    assert.ok('deferred' in result);
  });

  test('handles null projectState gracefully', () => {
    const changes = { additive: [], modifications: [], structural: [] };
    const result = mapChangesToPhases(changes, null);
    assert.deepStrictEqual(result.rework, []);
    assert.deepStrictEqual(result.free, []);
  });
});

describe('estimateMigrationCosts', () => {
  test('returns three options and recommendation', () => {
    const mapped = {
      rework: [],
      free: [{ id: 'A1', estimated_tokens: 10000, estimated_cost: 0.15 }],
      deferred: []
    };
    const result = estimateMigrationCosts(mapped, {});
    assert.ok(result.restart);
    assert.ok(result.in_place);
    assert.ok(result.phased);
    assert.ok(['A', 'B', 'C'].includes(result.recommendation));
    assert.ok(typeof result.restart.cost === 'number');
  });
});

describe('formatDiffReport', () => {
  test('returns a non-empty string', () => {
    const changes = {
      additive: [{ id: 'A1', description: 'New command', section: 'Commands', affected_components: ['templates/commands/'], estimated_tokens: 8000, estimated_cost: 0.15 }],
      modifications: [],
      structural: []
    };
    const mapped = { rework: [], free: changes.additive, deferred: [] };
    const migration = estimateMigrationCosts(mapped, {});
    const report = formatDiffReport({ changes, mapped, migration });
    assert.ok(typeof report === 'string');
    assert.ok(report.length > 100);
    assert.ok(report.includes('ADDITIVE CHANGES'));
    assert.ok(report.includes('MIGRATION OPTIONS'));
  });

  test('shows no-changes message for identical blueprints', () => {
    const changes = { additive: [], modifications: [], structural: [] };
    const mapped = { rework: [], free: [], deferred: [] };
    const migration = estimateMigrationCosts(mapped, {});
    const report = formatDiffReport({ changes, mapped, migration });
    assert.ok(report.includes('No changes detected'));
  });
});
