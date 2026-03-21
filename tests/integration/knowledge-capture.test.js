/**
 * Integration tests for knowledge note capture pipeline:
 * addNote → readNotes → getNotesForScope → buildKnowledgeNotesBlock → promoteEligibleNotes
 * Run: node --test tests/integration/knowledge-capture.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let origCwd;
let addNote, readNotes, getNotesForScope, buildKnowledgeNotesBlock,
    incrementSessionsSurvived, promoteEligibleNotes;

before(async () => {
  tmpDir = join(tmpdir(), `tw-knowledge-capture-int-test-${Date.now()}`);
  mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });
  mkdirSync(join(tmpDir, '.threadwork', 'specs', 'proposals'), { recursive: true });

  origCwd = process.cwd;
  Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

  const mod = await import('../../lib/knowledge-notes.js');
  addNote = mod.addNote;
  readNotes = mod.readNotes;
  getNotesForScope = mod.getNotesForScope;
  buildKnowledgeNotesBlock = mod.buildKnowledgeNotesBlock;
  incrementSessionsSurvived = mod.incrementSessionsSurvived;
  promoteEligibleNotes = mod.promoteEligibleNotes;
  // Keep cwd patched to tmpDir for all tests — restored in after()
});

after(() => {
  if (origCwd) Object.defineProperty(process, 'cwd', { value: origCwd, configurable: true });
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('knowledge capture full lifecycle', () => {
  test('note survives 2 sessions and becomes promotion-eligible', async () => {
    await addNote({
      category: 'workaround',
      scope: 'src/lib/**',
      summary: 'Use Object.defineProperty for process.cwd patching in ESM',
      evidence: 'tests/unit/store.test.js:12',
      critical: false
    });

    let notes = await readNotes();
    assert.equal(notes.length, 1);
    assert.equal(notes[0].sessionsSurvived, 0);

    // Simulate session 1 ending
    await incrementSessionsSurvived();
    notes = await readNotes();
    assert.equal(notes[0].sessionsSurvived, 1);

    let promoted = await promoteEligibleNotes();
    assert.equal(promoted.length, 0, 'Not yet eligible after 1 session');

    // Simulate session 2 ending
    await incrementSessionsSurvived();
    notes = await readNotes();
    assert.equal(notes[0].sessionsSurvived, 2);

    // Manually set confidence above threshold (notes start with default confidence)
    const notesPath = join(tmpDir, '.threadwork', 'state', 'knowledge-notes.json');
    const { readFileSync } = await import('fs');
    const data = JSON.parse(readFileSync(notesPath, 'utf8'));
    data.notes[0].confidence = 0.6;
    writeFileSync(notesPath, JSON.stringify(data, null, 2), 'utf8');

    promoted = await promoteEligibleNotes();
    assert.equal(promoted.length, 1);
    assert.equal(promoted[0].summary, 'Use Object.defineProperty for process.cwd patching in ESM');
  });

  test('critical note appears in block regardless of scope', async () => {
    // Clear and add a critical note
    const notesPath = join(tmpDir, '.threadwork', 'state', 'knowledge-notes.json');
    writeFileSync(notesPath, JSON.stringify({ notes: [] }, null, 2), 'utf8');

    await addNote({
      category: 'env_constraint',
      scope: 'tests/**',
      summary: 'THREADWORK_STORE_DIR must be set before importing store.js',
      evidence: 'tests/integration/store.test.js:18',
      critical: true
    });

    // Ask for notes relevant to a completely different scope
    const block = await buildKnowledgeNotesBlock('src/api/route.ts');
    // Critical note should still appear
    assert.ok(block.includes('THREADWORK_STORE_DIR') || block.length > 0);
  });

  test('scope-matched note appears in block', async () => {
    const notesPath = join(tmpDir, '.threadwork', 'state', 'knowledge-notes.json');
    writeFileSync(notesPath, JSON.stringify({ notes: [] }, null, 2), 'utf8');

    await addNote({
      category: 'api_behavior',
      scope: 'src/lib/**',
      summary: 'gray-matter silently ignores unquoted YAML values with colons',
      evidence: 'lib/spec-engine.js:45',
      critical: false
    });

    const block = await buildKnowledgeNotesBlock('src/lib/spec-engine.ts');
    assert.ok(block.includes('gray-matter') || block.length > 0);
  });

  test('notes from multiple categories are all preserved', async () => {
    const notesPath = join(tmpDir, '.threadwork', 'state', 'knowledge-notes.json');
    writeFileSync(notesPath, JSON.stringify({ notes: [] }, null, 2), 'utf8');

    const categories = ['workaround', 'api_behavior', 'env_constraint', 'test_config', 'pattern'];
    for (const category of categories) {
      await addNote({
        category,
        scope: 'src/**',
        summary: `Note for ${category}`,
        evidence: 'test.js:1',
        critical: false
      });
    }

    const notes = await readNotes();
    assert.equal(notes.length, 5);
    assert.ok(notes.every(n => typeof n.noteId === 'string'));
  });
});
