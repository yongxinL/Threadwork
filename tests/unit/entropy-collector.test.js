/**
 * Unit tests for lib/entropy-collector.js
 * Run: node --test tests/unit/entropy-collector.test.js
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-entropy');
mkdirSync(join(tmpDir, '.threadwork', 'state', 'phases', 'phase-1'), { recursive: true });
mkdirSync(join(tmpDir, '.threadwork', 'specs', 'backend'), { recursive: true });

Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const {
  isWaveComplete,
  getWaveDiff,
  writeEntropyReport,
  readEntropyReport,
  listEntropyReports,
  getEntropyReportSummary
} = await import('../../lib/entropy-collector.js');

describe('isWaveComplete', () => {
  test('returns true when all tasks are DONE or SKIPPED', () => {
    const execLog = {
      tasks: [
        { id: 'T-1-1-1', status: 'DONE' },
        { id: 'T-1-1-2', status: 'DONE' },
        { id: 'T-1-1-3', status: 'SKIPPED' }
      ]
    };
    assert.equal(isWaveComplete(execLog), true);
  });

  test('returns false when any task is IN_PROGRESS', () => {
    const execLog = {
      tasks: [
        { id: 'T-1-1-1', status: 'DONE' },
        { id: 'T-1-1-2', status: 'IN_PROGRESS' }
      ]
    };
    assert.equal(isWaveComplete(execLog), false);
  });

  test('returns false when any task is PENDING', () => {
    const execLog = {
      tasks: [
        { id: 'T-1-1-1', status: 'DONE' },
        { id: 'T-1-1-2', status: 'PENDING' }
      ]
    };
    assert.equal(isWaveComplete(execLog), false);
  });

  test('returns false for empty task list', () => {
    assert.equal(isWaveComplete({ tasks: [] }), false);
  });

  test('returns false for null/undefined input', () => {
    assert.equal(isWaveComplete(null), false);
    assert.equal(isWaveComplete(undefined), false);
  });
});

describe('getWaveDiff', () => {
  test('returns a string (empty if git unavailable in test env)', () => {
    // In test env, git diff may not work properly — just verify it returns a string
    const diff = getWaveDiff(1, 1);
    assert.equal(typeof diff, 'string');
  });
});

describe('writeEntropyReport', () => {
  test('creates correctly structured JSON file', () => {
    const report = {
      scanned_files: 5,
      issues: [
        {
          type: 'naming_drift',
          severity: 'minor',
          file: 'src/services/userAuth.ts',
          description: "Function 'getUserToken' diverges from convention 'fetchUserToken'",
          auto_fix: true,
          fix_applied: false,
          commit: null,
          spec_reference: null
        }
      ],
      auto_fixed: 0,
      queued_for_next_wave: 0,
      spec_proposals_generated: 0
    };

    writeEntropyReport(1, 1, report);

    const reportPath = join(tmpDir, '.threadwork', 'state', 'phases', 'phase-1', 'entropy-report-wave-1.json');
    assert.ok(existsSync(reportPath), 'Report file should exist');

    const written = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(written.wave, 1);
    assert.equal(written.phase, 1);
    assert.ok(typeof written.timestamp === 'string');
    assert.equal(written.scanned_files, 5);
    assert.equal(written.issues.length, 1);
    assert.equal(written.issues[0].type, 'naming_drift');
  });
});

describe('readEntropyReport', () => {
  test('returns report data for existing report', () => {
    const data = readEntropyReport(1, 1);
    assert.ok(data !== null);
    assert.equal(data.wave, 1);
    assert.ok(Array.isArray(data.issues));
  });

  test('returns null for non-existent report', () => {
    const data = readEntropyReport(99, 99);
    assert.equal(data, null);
  });
});

describe('listEntropyReports', () => {
  test('returns list with the written report', () => {
    const reports = listEntropyReports(1);
    assert.ok(Array.isArray(reports));
    assert.ok(reports.length >= 1);
    assert.equal(reports[0].waveId, '1');
  });

  test('returns empty array for phase with no reports', () => {
    mkdirSync(join(tmpDir, '.threadwork', 'state', 'phases', 'phase-99'), { recursive: true });
    const reports = listEntropyReports(99);
    assert.equal(reports.length, 0);
  });
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
