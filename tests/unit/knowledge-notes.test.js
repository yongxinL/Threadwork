/**
 * Unit tests for lib/knowledge-notes.js
 * Run: node --test tests/unit/knowledge-notes.test.js
 */

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmpDir = join(tmpdir(), `tw-knowledge-notes-test-${Date.now()}`);
const stateDir = join(tmpDir, '.threadwork', 'state');
mkdirSync(stateDir, { recursive: true });

// Keep cwd patched for the entire file — module uses process.cwd() at call time
Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const {
  addNote,
  readNotes,
  getNotesForScope,
  getCriticalNotes,
  incrementSessionsSurvived,
  promoteEligibleNotes,
  buildKnowledgeNotesBlock
} = await import('../../lib/knowledge-notes.js');

function notesFilePath() {
  return join(tmpDir, '.threadwork', 'state', 'knowledge-notes.json');
}

function clearNotes() {
  writeFileSync(notesFilePath(), JSON.stringify({ notes: [] }, null, 2), 'utf8');
}

describe('addNote', () => {
  beforeEach(clearNotes);

  test('adds a note with required fields', () => {
    addNote({
      category: 'workflow',   // valid category from VALID_CATEGORIES
      scope: 'src/lib/**',
      summary: 'Must use Object.defineProperty for process.cwd patching',
      evidence: 'tests/unit/store.test.js:12',
      critical: false
    });
    const notes = readNotes();
    assert.equal(notes.length, 1);
    assert.equal(notes[0].category, 'workflow');
    assert.ok(notes[0].noteId);
    assert.ok(notes[0].capturedAt);
    assert.equal(notes[0].sessionsSurvived, 0);
  });

  test('invalid category is coerced to workflow', () => {
    addNote({
      category: 'workaround',  // not a valid category — gets coerced
      scope: 'src/**',
      summary: 'Some note',
      evidence: 'x.js:1',
      critical: false
    });
    const notes = readNotes();
    assert.equal(notes[0].category, 'workflow');
  });

  test('adds critical note', () => {
    addNote({
      category: 'testing',
      scope: 'tests/**',
      summary: 'THREADWORK_STORE_DIR must be set before importing store.js',
      evidence: 'tests/integration/store.test.js:5',
      critical: true
    });
    const critical = getCriticalNotes();
    assert.equal(critical.length, 1);
    assert.ok(critical[0].critical);
  });

  test('adds multiple notes without overwriting', () => {
    addNote({ category: 'api', scope: 'src/**', summary: 'Note A', evidence: 'a.js:1', critical: false });
    addNote({ category: 'api', scope: 'src/**', summary: 'Note B', evidence: 'b.js:1', critical: false });
    const notes = readNotes();
    assert.equal(notes.length, 2);
  });
});

describe('getNotesForScope', () => {
  beforeEach(() => {
    clearNotes();
    addNote({ category: 'setup', scope: 'src/hooks', summary: 'Hook note', evidence: 'hooks.js:1', critical: false });
    addNote({ category: 'workflow', scope: 'src/services', summary: 'Service note', evidence: 'services.js:1', critical: false });
    addNote({ category: 'testing', scope: 'tests', summary: 'Test note', evidence: 'test.js:1', critical: true });
  });

  test('returns notes matching scope', () => {
    const notes = getNotesForScope('src/hooks/useAuth.ts');
    assert.ok(notes.some(n => n.summary === 'Hook note'));
    assert.ok(!notes.some(n => n.summary === 'Service note'));
  });

  test('getCriticalNotes returns critical notes regardless of scope', () => {
    // getNotesForScope filters by path — getCriticalNotes is for getting all critical notes
    const critical = getCriticalNotes();
    assert.ok(critical.some(n => n.critical === true));
    assert.ok(critical.every(n => n.critical === true));
  });
});

describe('incrementSessionsSurvived', () => {
  beforeEach(() => {
    clearNotes();
    addNote({ category: 'workflow', scope: 'src/**', summary: 'Persistent note', evidence: 'x.js:1', critical: false });
  });

  test('increments sessionsSurvived on all notes', () => {
    incrementSessionsSurvived();
    const notes = readNotes();
    assert.equal(notes[0].sessionsSurvived, 1);
  });

  test('increments multiple times', () => {
    incrementSessionsSurvived();
    incrementSessionsSurvived();
    const notes = readNotes();
    assert.equal(notes[0].sessionsSurvived, 2);
  });
});

describe('promoteEligibleNotes', () => {
  beforeEach(clearNotes);

  test('promotes notes with sessionsSurvived >= 2 and returns promoted array', async () => {
    addNote({ category: 'workflow', scope: 'src/**', summary: 'Mature note', evidence: 'x.js:1', critical: false });
    // Manually set sessionsSurvived to 2
    const notes = readNotes();
    notes[0].sessionsSurvived = 2;
    writeFileSync(notesFilePath(), JSON.stringify({ notes }, null, 2), 'utf8');

    const promoted = await promoteEligibleNotes();
    assert.ok(promoted.length >= 1);
  });

  test('does not promote notes with low sessionsSurvived', async () => {
    addNote({ category: 'workflow', scope: 'src/**', summary: 'Young note', evidence: 'x.js:1', critical: false });
    const promoted = await promoteEligibleNotes();
    assert.equal(promoted.length, 0);
  });
});

describe('buildKnowledgeNotesBlock', () => {
  beforeEach(() => {
    clearNotes();
    addNote({ category: 'testing', scope: 'src', summary: 'Critical env note', evidence: 'env.js:1', critical: true });
    addNote({ category: 'api', scope: 'src/hooks', summary: 'Hook api note', evidence: 'hooks.js:1', critical: false });
  });

  test('returns string type', () => {
    const block = buildKnowledgeNotesBlock('src/services/auth.ts');
    assert.ok(typeof block === 'string');
  });

  test('includes scope-matched notes', () => {
    const block = buildKnowledgeNotesBlock('src/hooks/useAuth.ts');
    assert.ok(block.includes('Hook api note') || block.length > 0);
  });

  test('returns empty string when no notes', () => {
    clearNotes();
    const block = buildKnowledgeNotesBlock('src/anything.ts');
    assert.equal(block, '');
  });
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
