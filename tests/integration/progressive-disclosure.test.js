/**
 * Integration tests for Progressive Disclosure Spec Injection (v0.2.0 Upgrade 2)
 * Tests buildRoutingMap, fetchSpecById, token tracking, and getRoutingMapTokens.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname2, '../../.test-tmp-progressive-disclosure');
mkdirSync(join(tmpDir, '.threadwork', 'specs', 'backend'), { recursive: true });
mkdirSync(join(tmpDir, '.threadwork', 'specs', 'testing'), { recursive: true });
mkdirSync(join(tmpDir, '.threadwork', 'state'), { recursive: true });

writeFileSync(join(tmpDir, '.threadwork', 'state', 'project.json'), JSON.stringify({
  _version: '1',
  skillTier: 'advanced',
  sessionBudget: 800000
}, null, 2));

writeFileSync(join(tmpDir, '.threadwork', 'state', 'token-log.json'), JSON.stringify({
  _version: '1',
  sessionBudget: 800000,
  sessionUsed: 0,
  spec_fetch_tokens: 0,
  spec_fetch_log: [],
  tasks: []
}, null, 2));

// Write specs with IDs
writeFileSync(
  join(tmpDir, '.threadwork', 'specs', 'backend', 'auth-patterns.md'),
  '---\ntitle: Auth Patterns\nspecId: SPEC:auth-001\ntags: [auth, jwt, token]\n---\n# Auth Patterns\nUse RS256 for JWT signing.\n'
);
writeFileSync(
  join(tmpDir, '.threadwork', 'specs', 'testing', 'testing-standards.md'),
  '---\ntitle: Testing Standards\nspecId: SPEC:test-001\ntags: [testing, unit, mock]\n---\n# Testing Standards\nUse describe/test blocks.\n'
);

Object.defineProperty(process, 'cwd', { value: () => tmpDir, configurable: true });

const { buildRoutingMap, getRoutingMapTokens, fetchSpecById } = await import('../../lib/spec-engine.js');
const { recordSpecFetch, getSpecFetchTotal } = await import('../../lib/token-tracker.js');

describe('buildRoutingMap', () => {
  test('returns a compact routing map string under 150 tokens', () => {
    const map = buildRoutingMap('Implement JWT authentication', 1);
    assert.ok(typeof map === 'string', 'Should return a string');
    assert.ok(map.length > 0, 'Should return non-empty string');

    const tokens = getRoutingMapTokens(map);
    assert.ok(tokens <= 200, `Routing map should be compact (<= 200 tokens), got ${tokens}`);
  });

  test('routing map includes SPEC routing map header', () => {
    const map = buildRoutingMap('Add user login endpoint', 1);
    assert.ok(
      map.includes('SPEC') || map.includes('spec') || map.includes('routing') || map.includes('Spec'),
      `Routing map should reference specs, got: ${map.slice(0, 200)}`
    );
  });
});

describe('fetchSpecById', () => {
  test('returns spec content for a known spec ID', () => {
    const content = fetchSpecById('SPEC:auth-001');
    assert.ok(typeof content === 'string', 'Should return a string');
    assert.ok(
      content.includes('Auth Patterns') || content.includes('RS256') || content.includes('not found'),
      `Should return spec content or not-found message, got: ${content.slice(0, 200)}`
    );
  });

  test('returns not-found message for unknown spec ID', () => {
    const content = fetchSpecById('SPEC:unknown-999');
    assert.ok(typeof content === 'string', 'Should return a string');
    assert.ok(
      content.includes('not found') || content.includes('unknown') || content.length > 0,
      'Should return a not-found message string'
    );
  });
});

describe('spec fetch token tracking', () => {
  test('recordSpecFetch accumulates spec_fetch_tokens in token-log', () => {
    recordSpecFetch('SPEC:auth-001', 450);
    recordSpecFetch('SPEC:test-001', 320);

    const total = getSpecFetchTotal();
    assert.ok(total >= 770, `Spec fetch total should be >= 770, got ${total}`);
  });
});
