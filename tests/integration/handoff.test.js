/**
 * Integration tests for lib/handoff.js
 * Verifies: all 10 sections present, resume prompt is self-contained
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-handoff');

// Override cwd for test
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

before(() => {
  mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
  mkdirSync(join(tmpDir, '.threadwork', 'workspace', 'handoffs'), { recursive: true });
  // Write minimal token-log
  writeFileSync(
    join(tmpDir, '.threadwork', 'state', 'token-log.json'),
    JSON.stringify({ sessionBudget: 800_000, sessionUsed: 200_000, tasks: [] })
  );
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('generateHandoff', () => {
  test('generates a file with all 10 required sections', async () => {
    const { generateHandoff } = await import('../../lib/handoff.js');

    const sessionData = {
      projectName: 'TestProject',
      phaseAtStart: 1,
      phaseAtEnd: 1,
      milestoneAtStart: 1,
      milestoneAtEnd: 1,
      completedTasks: ['T-1-1-1: Add login endpoint', 'T-1-1-2: Add JWT signing'],
      inProgressTask: 'T-1-1-3: Add refresh token rotation',
      inProgressPct: 40,
      keyDecisions: ['Chose jose over jsonwebtoken for Edge runtime compatibility'],
      sessionStartSha: 'abc1234',
      ralphResult: { passed: true, lastRun: '2025-08-01T10:00:00Z' },
      nextAction: 'Continue T-1-1-3: implement refresh token rotation in src/lib/auth.ts',
      skillTier: 'advanced'
    };

    const filepath = generateHandoff(sessionData);
    assert.ok(existsSync(filepath), 'Handoff file should be created');

    const { readFileSync } = await import('fs');
    const content = readFileSync(filepath, 'utf8');

    // All 10 sections must be present
    const requiredSections = [
      '## 1. Session Overview',
      '## 2. Completed This Session',
      '## 3. In Progress',
      '## 4. Key Decisions Made',
      '## 5. Files Modified',
      '## 6. Token Usage',
      '## 7. Git State',
      '## 8. Quality Gate Status',
      '## 9. Recommended Next Action',
      '## 10. Resume Prompt'
    ];

    for (const section of requiredSections) {
      assert.ok(content.includes(section), `Missing section: ${section}`);
    }
  });

  test('resume prompt is self-contained (contains all context needed)', async () => {
    const { formatResumePrompt } = await import('../../lib/handoff.js');

    const resumePrompt = formatResumePrompt({
      projectName: 'MyApp',
      phase: 2,
      milestone: 1,
      date: '2025-08-01',
      branch: 'feature/auth',
      completedTaskIds: ['T-1-1-1', 'T-1-1-2'],
      inProgressTask: 'T-1-1-3: refresh token rotation',
      nextAction: 'Continue T-1-1-3 in src/lib/auth.ts',
      budgetRemaining: 488_000,
      sessionBudget: 800_000,
      skillTier: 'advanced'
    });

    // Must contain all essential context
    assert.ok(resumePrompt.includes('MyApp'), 'Must include project name');
    assert.ok(resumePrompt.includes('Phase: 2'), 'Must include phase');
    assert.ok(resumePrompt.includes('feature/auth'), 'Must include branch');
    assert.ok(resumePrompt.includes('T-1-1-1'), 'Must include completed tasks');
    assert.ok(resumePrompt.includes('T-1-1-3'), 'Must include in-progress task');
    assert.ok(resumePrompt.includes('488K'), 'Must include remaining budget');
    assert.ok(resumePrompt.includes('advanced'), 'Must include skill tier');
    assert.ok(resumePrompt.includes('THREADWORK RESUME'), 'Must have resume banner');

    // Must be pasteable as standalone message (no external file references)
    assert.ok(!resumePrompt.includes('checkpoint.json'), 'Should not reference internal files');
    assert.ok(!resumePrompt.includes('.threadwork/'), 'Should not reference framework paths');
  });
});

describe('listHandoffs', () => {
  test('returns array (may be empty)', async () => {
    const { listHandoffs } = await import('../../lib/handoff.js');
    const list = listHandoffs();
    assert.ok(Array.isArray(list));
  });
});
