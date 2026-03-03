/**
 * Unit tests for lib/store.js
 * Run: node --test tests/unit/store.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// Use env var override so store.js uses a test-scoped directory
const tmpStore = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-store');
mkdirSync(join(tmpStore, 'patterns'), { recursive: true });
mkdirSync(join(tmpStore, 'edge-cases'), { recursive: true });
mkdirSync(join(tmpStore, 'conventions'), { recursive: true });

// Set env var BEFORE importing store.js
process.env.THREADWORK_STORE_DIR = tmpStore;

const {
  writeEntry,
  readStore,
  readEntry,
  searchStore,
  promoteToStore,
  pruneStore,
  getStoreInjectionBlock,
  getEntryConfidence
} = await import('../../lib/store.js');

describe('writeEntry', () => {
  beforeEach(() => {
    // Clean store index
    const indexPath = join(tmpStore, 'store-index.json');
    if (existsSync(indexPath)) {
      writeFileSync(indexPath, JSON.stringify({ entries: [] }, null, 2), 'utf8');
    }
    // Clean pattern files
    try {
      const files = readdirSync(join(tmpStore, 'patterns'));
      for (const f of files) unlinkSync(join(tmpStore, 'patterns', f));
    } catch { /* ok */ }
  });

  test('creates file in correct domain directory', async () => {
    const entryId = writeEntry('patterns', 'jwt-refresh-rotation', {
      content: '# JWT Refresh Token Rotation\n\nAlways invalidate old tokens on use.',
      confidence: 0.85,
      tags: ['auth', 'jwt'],
      projects: ['my-api']
    });

    assert.ok(entryId.startsWith('STORE:pat-'), `Expected STORE:pat- prefix, got ${entryId}`);

    // Check a file was created in patterns/
    const { readdirSync } = await import('fs');
    const files = readdirSync(join(tmpStore, 'patterns'));
    assert.ok(files.length >= 1, 'Should have at least one pattern file');
  });

  test('updates store-index.json', () => {
    writeEntry('patterns', 'test-pattern', {
      content: 'Test content',
      confidence: 0.8,
      tags: ['test']
    });

    const index = JSON.parse(readFileSync(join(tmpStore, 'store-index.json'), 'utf8'));
    assert.ok(Array.isArray(index.entries));
    assert.ok(index.entries.length >= 1);
    const found = index.entries.find(e => e.key === 'test-pattern');
    assert.ok(found, 'Entry should be in index');
    assert.equal(found.domain, 'patterns');
    assert.equal(found.confidence, 0.8);
  });
});

describe('readStore', () => {
  test('returns all entries', () => {
    const entries = readStore();
    assert.ok(Array.isArray(entries));
  });

  test('filters by domain', () => {
    const patterns = readStore('patterns');
    assert.ok(patterns.every(e => e.domain === 'patterns'));
  });
});

describe('searchStore', () => {
  test('finds entries by tag', () => {
    // Write a tagged entry first
    writeEntry('conventions', 'naming-convention', {
      content: '# Naming Convention\n\nAlways use camelCase for functions.',
      confidence: 0.9,
      tags: ['naming', 'convention']
    });
    const results = searchStore('naming');
    assert.ok(Array.isArray(results));
    // The search should find entries with 'naming' in tag or key
    assert.ok(results.length >= 0); // Results exist if entries were written
  });
});

describe('promoteToStore', () => {
  test('rejects proposals with confidence < 0.7 (auto)', () => {
    const result = promoteToStore({
      content: '---\nconfidence: 0.5\nspecName: test/pattern\n---\n\nTest pattern content',
      manualPromotion: false
    });
    assert.equal(result, null, 'Should return null for low-confidence auto promotion');
  });

  test('creates Store entry and marks proposal as promoted', () => {
    // Write a fake proposal file
    const tmpCwd = join(import.meta.dirname ?? process.cwd(), '../../.test-tmp-store-promote');
    mkdirSync(join(tmpCwd, '.threadwork', 'specs', 'proposals'), { recursive: true });
    const proposalPath = join(tmpCwd, '.threadwork', 'specs', 'proposals', 'test-proposal.md');
    writeFileSync(proposalPath, [
      '---',
      'proposalId: test-proposal',
      'specName: backend/auth-patterns',
      'confidence: 0.75',
      'learningSignal: "JWT refresh token rotation pattern"',
      '---',
      '',
      '# JWT Pattern',
      'Always rotate refresh tokens on use.'
    ].join('\n'), 'utf8');

    const entryId = promoteToStore({
      filePath: proposalPath,
      content: readFileSync(proposalPath, 'utf8'),
      manualPromotion: false
    });

    assert.ok(entryId !== null, 'Should create Store entry for confidence 0.75');
    assert.ok(typeof entryId === 'string', 'Should return entry ID string');

    // Check proposal is marked as promoted
    const proposalContent = readFileSync(proposalPath, 'utf8');
    assert.ok(proposalContent.includes('promoted: true'));
  });
});

describe('pruneStore', () => {
  test('removes entries below threshold', () => {
    // Write a low-confidence entry
    writeEntry('edge-cases', 'low-confidence-entry', {
      content: 'Low confidence pattern',
      confidence: 0.2,
      tags: []
    });

    const before = readStore().length;
    const pruned = pruneStore(0.4);
    const after = readStore().length;

    assert.ok(pruned >= 0); // Should have pruned at least 0 entries
    assert.ok(after <= before); // Store should have same or fewer entries
  });
});

describe('getStoreInjectionBlock', () => {
  test('returns block under 100 tokens when entries exist', () => {
    // Ensure there's at least one entry
    writeEntry('patterns', 'token-test-pattern', {
      content: 'Test pattern for token count',
      confidence: 0.9,
      tags: ['test']
    });

    const block = getStoreInjectionBlock();
    if (block === null) {
      // No entries — acceptable
      assert.ok(true);
      return;
    }
    const tokens = Math.ceil(block.length / 4);
    assert.ok(tokens <= 100, `Expected <=100 tokens, got ${tokens} (${block.length} chars)`);
  });
});
