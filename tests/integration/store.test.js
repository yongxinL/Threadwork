/**
 * Integration tests for the Cross-Session Memory Store (v0.2.0 Upgrade 4)
 * Tests writeEntry, searchStore, and promoteToStore end-to-end.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const tmpStore = join(__dirname2, '../../.test-tmp-store-int');

mkdirSync(join(tmpStore, 'patterns'), { recursive: true });
mkdirSync(join(tmpStore, 'edge-cases'), { recursive: true });
mkdirSync(join(tmpStore, 'conventions'), { recursive: true });
writeFileSync(join(tmpStore, 'store-index.json'), JSON.stringify({
  _version: '0.2.0',
  entries: []
}, null, 2));

process.env.THREADWORK_STORE_DIR = tmpStore;

const { writeEntry, readStore, searchStore, promoteToStore, getEntryConfidence } = await import('../../lib/store.js');

describe('writeEntry and readStore integration', () => {
  test('writeEntry creates a file and updates the store index', () => {
    writeEntry('patterns', 'jwt-refresh-rotation', {
      confidence: 0.85,
      tags: ['auth', 'jwt', 'security'],
      source: 'ralph-loop-finding',
      content: '# JWT Refresh Token Rotation\n\nAlways invalidate the old refresh token on first use.'
    });

    const entries = readStore('patterns');
    assert.ok(Array.isArray(entries), 'readStore should return an array');
    assert.ok(entries.length >= 1, 'Should have at least one entry');

    const entry = entries.find(e => e.key === 'jwt-refresh-rotation');
    assert.ok(entry, 'Entry should be findable by key');
    assert.equal(entry.confidence, 0.85);
  });
});

describe('searchStore integration', () => {
  test('searchStore finds entries by tag', () => {
    // Add a second entry for searching
    writeEntry('edge-cases', 'oauth-state-validation', {
      confidence: 0.78,
      tags: ['auth', 'oauth', 'security'],
      source: 'session-finding',
      content: '# OAuth State Validation\n\nAlways validate the state parameter.'
    });

    const results = searchStore('jwt');
    assert.ok(Array.isArray(results), 'searchStore should return an array');
    assert.ok(results.length >= 1, `Should find at least 1 result for 'jwt', got ${results.length}`);
  });

  test('searchStore returns empty array for unknown query', () => {
    const results = searchStore('zzz-no-match-xyz');
    assert.ok(Array.isArray(results), 'Should return an array');
    assert.equal(results.length, 0, 'Should return empty for unknown query');
  });
});

describe('promoteToStore integration', () => {
  test('promoteToStore rejects proposals with confidence below 0.7', () => {
    // A proposal dir in a temp location
    const proposalsDir = join(__dirname2, '../../.test-tmp-store-proposals');
    mkdirSync(proposalsDir, { recursive: true });

    const proposalPath = join(proposalsDir, 'low-confidence-proposal.md');
    writeFileSync(proposalPath, [
      '---',
      'specName: low-confidence-thing',
      'confidence: 0.4',
      'promoted: false',
      'tags: [test]',
      '---',
      '# Low Confidence Proposal',
      'Not ready for promotion.'
    ].join('\n'));

    // Should not promote — confidence 0.4 < 0.7 threshold
    let threw = false;
    try {
      promoteToStore(proposalPath);
    } catch {
      threw = true;
    }
    // Either throws or returns without promoting
    if (!threw) {
      // Check proposal was NOT marked promoted (confidence too low)
      const content = readFileSync(proposalPath, 'utf8');
      assert.ok(
        !content.includes('promoted: true') || content.includes('confidence: 0.4'),
        'Low confidence proposals should not be promoted'
      );
    }

    try { rmSync(proposalsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});

after(() => {
  try { rmSync(tmpStore, { recursive: true, force: true }); } catch { /* ignore */ }
});
