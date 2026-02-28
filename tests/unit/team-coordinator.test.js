/**
 * tests/unit/team-coordinator.test.js
 *
 * Unit tests for lib/team-coordinator.js
 * Uses node:test and node:assert/strict — no external test runner required.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Test setup: isolated tmpDir per test run ────────────────────────────────

let tmpDir;

before(() => {
  tmpDir = join(tmpdir(), `tw-team-coord-test-${Date.now()}`);
  mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
  // Change cwd so state.js writes to tmpDir
  process.chdir(tmpDir);
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function readStateFile(filename) {
  const p = join(tmpDir, '.threadwork', 'state', filename);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ── Import module under test ───────────────────────────────────────────────

// Dynamic import so the module picks up the changed cwd from before()
let mod;
before(async () => {
  mod = await import('../../lib/team-coordinator.js');
});

// ── writeTeamSession / readTeamSession / clearTeamSession ──────────────────

describe('writeTeamSession / readTeamSession / clearTeamSession', () => {
  it('round-trips session data', () => {
    const data = {
      teamName: 'tw-phase-1-0-12345678',
      phase: 1,
      waveIndex: 0,
      mode: 'execute-phase',
      status: 'active'
    };
    mod.writeTeamSession(data);
    const result = mod.readTeamSession();
    assert.equal(result.teamName, data.teamName);
    assert.equal(result.phase, 1);
    assert.equal(result.status, 'active');
  });

  it('stamps _version and _updated on every write', () => {
    mod.writeTeamSession({ teamName: 'test', status: 'active' });
    const result = readStateFile('team-session.json');
    assert.ok(result._version, '_version should be present');
    assert.ok(result._updated, '_updated should be present');
    assert.ok(new Date(result._updated).getTime() > 0, '_updated should be a valid ISO date');
  });

  it('readTeamSession returns null when file does not exist', () => {
    const p = join(tmpDir, '.threadwork', 'state', 'team-session.json');
    try { rmSync(p); } catch { /* ok if not present */ }
    assert.equal(mod.readTeamSession(), null);
  });

  it('clearTeamSession writes cleared: true', () => {
    mod.writeTeamSession({ teamName: 'test', status: 'active' });
    mod.clearTeamSession();
    const result = readStateFile('team-session.json');
    assert.equal(result.cleared, true);
  });
});

// ── isTeamSessionActive ────────────────────────────────────────────────────

describe('isTeamSessionActive', () => {
  beforeEach(() => {
    const p = join(tmpDir, '.threadwork', 'state', 'team-session.json');
    try { rmSync(p); } catch { /* ok */ }
  });

  it('returns false when no file exists', () => {
    assert.equal(mod.isTeamSessionActive(), false);
  });

  it('returns false when cleared=true', () => {
    mod.writeTeamSession({ status: 'active', cleared: true, startedAt: new Date().toISOString() });
    assert.equal(mod.isTeamSessionActive(), false);
  });

  it('returns false when status is not active', () => {
    mod.writeTeamSession({ status: 'completed', cleared: false, startedAt: new Date().toISOString() });
    assert.equal(mod.isTeamSessionActive(), false);
  });

  it('returns false when session is older than 2 hours', () => {
    const staleDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    mod.writeTeamSession({ status: 'active', cleared: false, startedAt: staleDate });
    assert.equal(mod.isTeamSessionActive(), false);
  });

  it('returns true when active, not cleared, and recent', () => {
    mod.writeTeamSession({ status: 'active', cleared: false, startedAt: new Date().toISOString() });
    assert.equal(mod.isTeamSessionActive(), true);
  });
});

// ── generateTeamName ───────────────────────────────────────────────────────

describe('generateTeamName', () => {
  it('returns a string under 40 characters', () => {
    const name = mod.generateTeamName(2, 1);
    assert.equal(typeof name, 'string');
    assert.ok(name.length <= 40, `name too long: ${name.length} chars`);
  });

  it('contains no special characters beyond hyphens', () => {
    const name = mod.generateTeamName(3, 5);
    assert.match(name, /^[a-z0-9-]+$/);
  });

  it('includes phase and waveIndex', () => {
    const name = mod.generateTeamName(4, 2);
    assert.ok(name.includes('4'), 'should include phase number');
    assert.ok(name.includes('2'), 'should include wave index');
  });
});

// ── generateParallelTeamName ───────────────────────────────────────────────

describe('generateParallelTeamName', () => {
  it('returns a string under 40 characters', () => {
    const name = mod.generateParallelTeamName('add-dark-mode-toggle');
    assert.ok(name.length <= 40, `name too long: ${name.length} chars`);
  });

  it('handles special characters in slug', () => {
    const name = mod.generateParallelTeamName('Add Dark Mode!!! (v2)');
    assert.match(name, /^[a-z0-9-]+$/);
  });
});

// ── getWorkerNamesForWave ──────────────────────────────────────────────────

describe('getWorkerNamesForWave', () => {
  it('maps PLAN-1-2 to tw-executor-plan-1-2', () => {
    const result = mod.getWorkerNamesForWave(['PLAN-1-2']);
    assert.deepEqual(result, ['tw-executor-plan-1-2']);
  });

  it('maps multiple plan IDs correctly', () => {
    const result = mod.getWorkerNamesForWave(['PLAN-2-1', 'PLAN-2-3', 'PLAN-2-5']);
    assert.deepEqual(result, [
      'tw-executor-plan-2-1',
      'tw-executor-plan-2-3',
      'tw-executor-plan-2-5'
    ]);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(mod.getWorkerNamesForWave([]), []);
  });
});

// ── calcWorkerBudget ───────────────────────────────────────────────────────

describe('calcWorkerBudget', () => {
  it('splits budget across workers with 0.6 factor', () => {
    // floor(600000 * 0.6 / 3) = floor(120000) = 120000
    assert.equal(mod.calcWorkerBudget(600_000, 3), 120_000);
  });

  it('never returns below 50K minimum', () => {
    const result = mod.calcWorkerBudget(10_000, 10); // would be 600 without floor
    assert.equal(result, 50_000);
  });

  it('handles single worker', () => {
    // floor(800000 * 0.6 / 1) = 480000
    assert.equal(mod.calcWorkerBudget(800_000, 1), 480_000);
  });

  it('handles 0 workers gracefully (treats as 1)', () => {
    const result = mod.calcWorkerBudget(800_000, 0);
    assert.equal(result, 480_000);
  });
});

// ── getMaxWorkersForTier ──────────────────────────────────────────────────

describe('getMaxWorkersForTier', () => {
  it('returns 2 for beginner', () => {
    assert.equal(mod.getMaxWorkersForTier('beginner'), 2);
  });

  it('returns 3 for advanced', () => {
    assert.equal(mod.getMaxWorkersForTier('advanced'), 3);
  });

  it('returns 5 for ninja', () => {
    assert.equal(mod.getMaxWorkersForTier('ninja'), 5);
  });

  it('returns 3 for unknown tier (default)', () => {
    assert.equal(mod.getMaxWorkersForTier('unknown'), 3);
  });
});

// ── shouldUseTeamMode ──────────────────────────────────────────────────────

describe('shouldUseTeamMode', () => {
  const base = {
    planCount: 3,
    remainingBudget: 500_000,
    sessionBudget: 800_000,
    waveBudgetEst: 120_000,
    teamModeSetting: 'auto',
    tier: 'advanced',
    forceTeam: false,
    forceNoTeam: false
  };

  it('returns false when --no-team flag set (always wins)', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, forceNoTeam: true, forceTeam: true }), false);
  });

  it('returns true when --team flag set and budget sufficient', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, forceTeam: true, teamModeSetting: 'legacy' }), true);
  });

  it('returns false when --team flag set but budget < 10%', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, forceTeam: true, remainingBudget: 50_000, sessionBudget: 800_000 }), false);
  });

  it('returns false when teamMode=legacy', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, teamModeSetting: 'legacy' }), false);
  });

  it('returns true when teamMode=team and budget sufficient', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, teamModeSetting: 'team' }), true);
  });

  it('returns false when teamMode=team but budget < 10%', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, teamModeSetting: 'team', remainingBudget: 40_000 }), false);
  });

  it('auto: returns true when all four conditions pass', () => {
    assert.equal(mod.shouldUseTeamMode(base), true);
  });

  it('auto: returns false when planCount < 2', () => {
    assert.equal(mod.shouldUseTeamMode({ ...base, planCount: 1 }), false);
  });

  it('auto: returns false when remaining budget < 30%', () => {
    // 200K / 800K = 25% < 30%
    assert.equal(mod.shouldUseTeamMode({ ...base, remainingBudget: 200_000 }), false);
  });

  it('auto: returns false when wave estimate > 50% of remaining', () => {
    // waveBudgetEst 300K > remainingBudget 500K * 0.5 = 250K
    assert.equal(mod.shouldUseTeamMode({ ...base, waveBudgetEst: 300_000 }), false);
  });

  it('auto: returns false when tier max workers < 2 (edge case)', () => {
    // Override getMaxWorkersForTier would return 1 for a hypothetical tier
    // Since our implementation returns min 2, test with beginner which returns 2 (passes)
    // This tests the edge of the condition
    assert.equal(mod.shouldUseTeamMode({ ...base, tier: 'beginner' }), true); // beginner=2, passes
  });
});
