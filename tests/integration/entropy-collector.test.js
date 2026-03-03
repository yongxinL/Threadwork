/**
 * Integration tests for the Background Entropy Collector (v0.2.0 Upgrade 3)
 * Tests isWaveComplete, writeEntropyReport, readEntropyReport, and listEntropyReports.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname2, '../../.test-tmp-entropy-collector-int');
mkdirSync(join(tmpDir, '.threadwork', 'state', 'phases', 'phase-1'), { recursive: true });

Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const {
  isWaveComplete,
  writeEntropyReport,
  readEntropyReport,
  listEntropyReports
} = await import('../../lib/entropy-collector.js');

describe('isWaveComplete integration', () => {
  test('returns true for a completed wave execution log', () => {
    const log = {
      wave: 1,
      phase: 1,
      tasks: [
        { id: 'T-1-1-1', status: 'DONE' },
        { id: 'T-1-1-2', status: 'DONE' },
        { id: 'T-1-1-3', status: 'SKIPPED' }
      ]
    };
    assert.equal(isWaveComplete(log), true);
  });

  test('returns false when any task is still in progress', () => {
    const log = {
      wave: 1,
      phase: 1,
      tasks: [
        { id: 'T-1-1-1', status: 'DONE' },
        { id: 'T-1-1-2', status: 'IN_PROGRESS' }
      ]
    };
    assert.equal(isWaveComplete(log), false);
  });
});

describe('writeEntropyReport / readEntropyReport integration', () => {
  const sampleReport = {
    wave: 2,
    phase: 1,
    timestamp: new Date().toISOString(),
    scanned_files: 5,
    issues: [
      {
        type: 'naming_drift',
        severity: 'minor',
        file: 'src/utils/helperFn.ts',
        description: 'Function naming diverges from project convention',
        auto_fix: false,
        fix_applied: false,
        spec_reference: 'SPEC:naming-001'
      }
    ],
    auto_fixed: 0,
    queued_for_next_wave: 1,
    spec_proposals_generated: 0
  };

  test('writeEntropyReport creates the report file', () => {
    const filepath = writeEntropyReport(2, 1, sampleReport);
    assert.ok(typeof filepath === 'string' || filepath === undefined, 'Should write report');

    const read = readEntropyReport(2, 1);
    assert.ok(read !== null, 'Should be able to read the written report');
    if (read) {
      assert.equal(read.wave, 2, 'wave should match');
      assert.equal(read.phase, 1, 'phase should match');
      assert.ok(Array.isArray(read.issues), 'issues should be an array');
      assert.equal(read.issues.length, 1);
      assert.equal(read.issues[0].type, 'naming_drift');
    }
  });

  test('listEntropyReports returns array including the written report', () => {
    const reports = listEntropyReports(1);
    assert.ok(Array.isArray(reports), 'Should return an array');
    assert.ok(reports.length >= 1, `Should have at least 1 report, got ${reports.length}`);
  });
});
