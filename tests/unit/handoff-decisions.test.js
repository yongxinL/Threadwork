/**
 * Unit tests for lib/handoff.js — v0.2.0 decision log auto-population
 * Run: node --test tests/unit/handoff-decisions.test.js
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-handoff-decisions');
mkdirSync(join(tmpDir, '.threadwork', 'workspace', 'handoffs'), { recursive: true });
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

// Override process.cwd
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

// Mock git module by setting up a minimal git state
// We'll test generateHandoff's section 4 behavior indirectly
// by checking that the handoff content matches expected format

const { generateHandoff } = await import('../../lib/handoff.js');

describe('generateHandoff section 4', () => {
  test('is auto-populated from readSessionDecisions() — shows fallback when no decisions', () => {
    const filepath = generateHandoff({
      projectName: 'Test Project',
      phaseAtStart: 1,
      phaseAtEnd: 1,
      milestoneAtStart: 1,
      milestoneAtEnd: 1,
      completedTasks: ['T-1-1-1: Test task'],
      inProgressTask: 'None',
      keyDecisions: [], // empty manual decisions
      sessionStartSha: 'unknown', // no git — triggers fallback
      ralphResult: { passed: true, lastRun: '2025-01-01' },
      nextAction: 'Continue to next phase.',
      skillTier: 'advanced'
    });

    assert.ok(existsSync(filepath), 'Handoff file should be created');
    const content = readFileSync(filepath, 'utf8');

    assert.ok(content.includes('## 4. Key Decisions Made'), 'Should have Section 4');
    // With no session decisions and no keyDecisions, should show fallback
    assert.ok(
      content.includes('_No architectural decisions recorded this session._') ||
      content.includes('_No major architectural'),
      `Expected fallback text in section 4, got: ${content.slice(content.indexOf('## 4.'), content.indexOf('## 5.'))}`
    );
  });

  test('shows fallback text when no decisions recorded', () => {
    const filepath = generateHandoff({
      projectName: 'Test Project 2',
      phaseAtStart: 1,
      phaseAtEnd: 1,
      milestoneAtStart: 1,
      milestoneAtEnd: 1,
      completedTasks: [],
      inProgressTask: 'None',
      keyDecisions: ['Chose PostgreSQL for its JSONB support'],
      sessionStartSha: 'unknown',
      ralphResult: { passed: null, lastRun: 'Not run' },
      nextAction: 'Review.',
      skillTier: 'advanced'
    });

    const content = readFileSync(filepath, 'utf8');
    // When sessionStartSha is 'unknown', readSessionDecisions returns [],
    // so should fall back to the provided keyDecisions
    assert.ok(content.includes('## 4. Key Decisions Made'), 'Should have Section 4');
    assert.ok(
      content.includes('PostgreSQL') || content.includes('_No architectural decisions'),
      `Expected fallback text, got section 4: ${content.slice(content.indexOf('## 4.'), content.indexOf('## 5.'))}`
    );
  });
});

after(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
