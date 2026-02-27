/**
 * Unit tests for lib/skill-tier.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Set up temp project structure
const tmpDir = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-tier');
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const { getTierInstructions, getWarningStyle, setTier, getTier, formatOutput } =
  await import('../../lib/skill-tier.js');

describe('getTierInstructions', () => {
  test('beginner tier returns longest instructions', () => {
    const beginner = getTierInstructions('beginner');
    const advanced = getTierInstructions('advanced');
    const ninja = getTierInstructions('ninja');
    assert.ok(beginner.length > 0);
    assert.ok(advanced.length > 0);
    assert.ok(ninja.length > 0);
    // Beginner should be most verbose
    assert.ok(beginner.length > ninja.length);
  });

  test('each tier mentions its mode name', () => {
    assert.ok(getTierInstructions('beginner').includes('Beginner'));
    assert.ok(getTierInstructions('advanced').includes('Advanced'));
    assert.ok(getTierInstructions('ninja').includes('Ninja'));
  });

  test('ninja explicitly says minimal output', () => {
    assert.ok(getTierInstructions('ninja').toLowerCase().includes('minimal'));
  });

  test('beginner mentions comments and step-by-step', () => {
    const instr = getTierInstructions('beginner').toLowerCase();
    assert.ok(instr.includes('comment') || instr.includes('step'));
  });
});

describe('getWarningStyle', () => {
  test('ninja: single emoji + message', () => {
    const w = getWarningStyle('warning', 'budget low', 'ninja');
    assert.ok(w.includes('⚠'));
    assert.ok(w.length < 30);
  });

  test('beginner: includes explanation', () => {
    const w = getWarningStyle('critical', 'budget at 90%', 'beginner');
    assert.ok(w.length > 50);
    assert.ok(w.includes('/tw:done') || w.toLowerCase().includes('session'));
  });

  test('advanced: brief one-liner', () => {
    const w = getWarningStyle('warning', 'some warning', 'advanced');
    assert.ok(w.includes('⚠️'));
    assert.ok(!w.includes('\n')); // single line
  });

  test('all tiers return non-empty string for all levels', () => {
    for (const tier of ['beginner', 'advanced', 'ninja']) {
      for (const level of ['info', 'warning', 'critical']) {
        const result = getWarningStyle(level, 'test message', tier);
        assert.ok(typeof result === 'string' && result.length > 0);
      }
    }
  });
});

describe('setTier / getTier', () => {
  test('invalid tier throws error', () => {
    assert.throws(() => setTier('expert'), /Invalid skill tier/);
  });

  test('valid tiers are accepted', () => {
    for (const tier of ['beginner', 'advanced', 'ninja']) {
      assert.doesNotThrow(() => setTier(tier));
      assert.equal(getTier(), tier);
    }
  });

  test('defaults to advanced when unset', () => {
    // Write project.json without skillTier
    writeFileSync(
      join(tmpDir, '.threadwork', 'state', 'project.json'),
      JSON.stringify({ projectName: 'test' }),
      'utf8'
    );
    assert.equal(getTier(), 'advanced');
  });
});

describe('formatOutput', () => {
  test('ninja mode strips headers', () => {
    const content = '## Big Header\nSome content\n### Sub header\nMore content';
    const out = formatOutput(content, { tier: 'ninja' });
    assert.ok(!out.includes('## Big Header'));
    assert.ok(out.includes('Some content'));
  });

  test('beginner mode returns content unchanged', () => {
    const content = '## Header\nSome content';
    assert.equal(formatOutput(content, { tier: 'beginner' }), content);
  });
});
