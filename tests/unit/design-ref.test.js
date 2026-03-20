/**
 * Unit tests for lib/design-ref.js
 * Run: node --test tests/unit/design-ref.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir;
let loadDesignRefs, resolveDesignRefsForFiles, validateDesignRefs, buildDesignInjectionBlock;

before(async () => {
  tmpDir = join(tmpdir(), `tw-design-ref-test-${Date.now()}`);
  const specsDir = join(tmpDir, '.threadwork', 'specs', 'frontend');
  const designsDir = join(tmpDir, 'designs');
  mkdirSync(specsDir, { recursive: true });
  mkdirSync(designsDir, { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'app'), { recursive: true });

  // Create a real design file
  writeFileSync(join(designsDir, 'homepage.html'), '<html><body><h1>Home</h1></body></html>');

  // Create a spec with design refs
  writeFileSync(join(specsDir, 'homepage.md'), [
    '---',
    'specId: SPEC:fe-001',
    'name: Homepage Spec',
    'design_refs:',
    '  - path: designs/homepage.html',
    '    label: Homepage desktop layout',
    '    scope: src/app/page**',
    '    fidelity: structural',
    '  - path: designs/missing.png',
    '    label: Missing design',
    '    scope: src/app/missing**',
    '    fidelity: exact',
    '---',
    '',
    '# Homepage Spec'
  ].join('\n'));

  const mod = await import('../../lib/design-ref.js');
  loadDesignRefs = mod.loadDesignRefs;
  resolveDesignRefsForFiles = mod.resolveDesignRefsForFiles;
  validateDesignRefs = mod.validateDesignRefs;
  buildDesignInjectionBlock = mod.buildDesignInjectionBlock;
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadDesignRefs', () => {
  test('loads design refs from spec frontmatter', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    assert.ok(refs.length >= 1);
    const ref = refs.find(r => r.path === 'designs/homepage.html');
    assert.ok(ref);
    assert.equal(ref.fidelity, 'structural');
    assert.equal(ref.scope, 'src/app/page**');
    assert.equal(ref.specId, 'SPEC:fe-001');
  });

  test('resolves absolute path', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const ref = refs.find(r => r.path === 'designs/homepage.html');
    assert.ok(ref.absolutePath.startsWith(tmpDir));
  });

  test('marks missing files with exists:false', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const missing = refs.find(r => r.path === 'designs/missing.png');
    assert.ok(missing);
    assert.equal(missing.exists, false);
  });
});

describe('resolveDesignRefsForFiles', () => {
  test('returns refs whose scope matches task files', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const matched = resolveDesignRefsForFiles(refs, ['src/app/page.tsx', 'src/app/layout.tsx']);
    assert.ok(matched.some(r => r.path === 'designs/homepage.html'));
  });

  test('excludes refs whose scope does not match', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const matched = resolveDesignRefsForFiles(refs, ['src/api/route.ts']);
    // homepage.html has scope src/app/page** which doesn't match src/api/**
    assert.ok(!matched.some(r => r.path === 'designs/homepage.html'));
  });

  test('returns empty array when no files provided', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const matched = resolveDesignRefsForFiles(refs, []);
    assert.deepEqual(matched, []);
  });
});

describe('validateDesignRefs', () => {
  test('flags missing design files in missing array', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const { missing } = validateDesignRefs(refs, tmpDir);
    assert.ok(missing.some(i => i.path === 'designs/missing.png'));
  });

  test('existing files are in valid array', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const { valid, missing } = validateDesignRefs(refs, tmpDir);
    assert.ok(valid.some(i => i.path === 'designs/homepage.html'));
    assert.ok(!missing.some(i => i.path === 'designs/homepage.html'));
  });
});

describe('buildDesignInjectionBlock', () => {
  test('builds injection block for HTML design refs', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const existing = refs.filter(r => r.exists);
    const block = await buildDesignInjectionBlock(existing, tmpDir);
    assert.ok(typeof block === 'string');
    assert.ok(block.includes('Homepage desktop layout') || block.includes('homepage'));
  });

  test('returns empty string for empty refs array', async () => {
    const block = await buildDesignInjectionBlock([], tmpDir);
    assert.equal(block.trim(), '');
  });

  test('includes fidelity level in block', async () => {
    const refs = await loadDesignRefs(join(tmpDir, '.threadwork', 'specs'), tmpDir);
    const existing = refs.filter(r => r.exists);
    const block = await buildDesignInjectionBlock(existing, tmpDir);
    assert.ok(block.includes('structural') || block.includes('fidelity'));
  });
});
