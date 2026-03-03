/**
 * lib/spec-engine.js — Spec library management
 *
 * Manages the spec library: read, write, update, search, and inject specs.
 * Spec files use gray-matter frontmatter: domain, name, updated, confidence, tags.
 *
 * Spec library lives at: .threadwork/specs/
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import matter from 'gray-matter';

const MAX_INJECTION_TOKENS = 8000;
const CHARS_PER_TOKEN = 4;

function specsDir() {
  return join(process.cwd(), '.threadwork', 'specs');
}

function proposalsDir() {
  return join(process.cwd(), '.threadwork', 'specs', 'proposals');
}

function specFilePath(domain, specName) {
  return join(specsDir(), domain, `${specName}.md`);
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

// ── Index ─────────────────────────────────────────────────────────────────────

/**
 * Load the spec index file.
 * @returns {string} Raw markdown content of index.md
 */
export function loadSpecIndex() {
  const indexPath = join(specsDir(), 'index.md');
  if (!existsSync(indexPath)) return '';
  return readFileSync(indexPath, 'utf8');
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load a specific spec file, parsed with gray-matter.
 * @param {string} domain e.g. 'frontend'
 * @param {string} specName e.g. 'react-patterns'
 * @returns {{ data: object, content: string } | null}
 */
export function loadSpec(domain, specName) {
  const p = specFilePath(domain, specName);
  if (!existsSync(p)) return null;
  return matter(readFileSync(p, 'utf8'));
}

/**
 * Load all specs for a domain.
 * @param {string} domain
 * @returns {Array<{ data: object, content: string, name: string }>}
 */
export function loadDomainSpecs(domain) {
  const dir = join(specsDir(), domain);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => {
      const parsed = matter(readFileSync(join(dir, f), 'utf8'));
      return { ...parsed, name: f.replace('.md', '') };
    });
}

// ── Relevance Selection ───────────────────────────────────────────────────────

/**
 * Select relevant specs for a task by keyword + phase heuristics.
 * @param {string} taskDescription
 * @param {number|string} [phase]
 * @returns {Array<{ domain: string, name: string, data: object, content: string }>}
 */
export function getRelevantSpecs(taskDescription, phase) {
  const desc = (taskDescription ?? '').toLowerCase();
  const results = [];

  const domainKeywords = {
    frontend: ['react', 'component', 'ui', 'css', 'style', 'hook', 'jsx', 'tsx', 'page', 'layout', 'animation', 'form', 'button', 'modal'],
    backend: ['api', 'route', 'endpoint', 'server', 'database', 'sql', 'query', 'auth', 'jwt', 'session', 'middleware', 'handler', 'service'],
    testing: ['test', 'spec', 'assert', 'mock', 'stub', 'coverage', 'unit', 'integration', 'e2e', 'fixture']
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    const matches = keywords.filter(k => desc.includes(k));
    if (matches.length > 0) {
      const specs = loadDomainSpecs(domain);
      for (const spec of specs) {
        const specKeywords = (spec.data.tags ?? []).map(t => t.toLowerCase());
        const relevance = specKeywords.filter(k => desc.includes(k)).length + matches.length;
        results.push({ domain, relevance, ...spec });
      }
    }
  }

  // Sort by relevance descending, return top 5
  return results
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Create or update a spec file + update the index.
 * @param {string} domain
 * @param {string} specName
 * @param {string} content Full markdown content including frontmatter
 */
export function writeSpec(domain, specName, content) {
  const dir = join(specsDir(), domain);
  ensureDir(dir);
  writeFileSync(specFilePath(domain, specName), content, 'utf8');
  rebuildIndex();
}

/**
 * Write a spec update proposal to the proposals directory.
 * Proposals require explicit acceptance before becoming active.
 * If a proposal with the same learning_signal fingerprint already exists,
 * increments its confidence by 0.1 per additional call (capped at 0.6 until human review).
 *
 * @param {string} specName  e.g. 'frontend/react-patterns' or 'auto/lint-fix'
 * @param {string} newContent
 * @param {string} reason    Why this update was proposed
 * @param {object} [options]
 * @param {string} [options.source]          e.g. 'ralph-loop'
 * @param {string} [options.learningSignal]  Fingerprint for deduplication
 * @returns {string} proposalId
 */
export function proposeSpecUpdate(specName, newContent, reason, options = {}) {
  ensureDir(proposalsDir());

  const { source, learningSignal } = options;

  // Check for existing proposal with the same learning signal fingerprint
  if (learningSignal && source === 'ralph-loop') {
    try {
      const existing = readdirSync(proposalsDir()).filter(f => f.endsWith('.md'));
      for (const file of existing) {
        const filePath = join(proposalsDir(), file);
        const parsed = matter(readFileSync(filePath, 'utf8'));
        if (parsed.data.learningSignal === learningSignal && parsed.data.confidence < 0.6) {
          // Increment confidence for repeated failure
          const newConfidence = Math.min(0.6, (parsed.data.confidence ?? 0.3) + 0.1);
          const updated = matter.stringify(parsed.content, {
            ...parsed.data,
            confidence: newConfidence,
            auto_confidence_promoted: true,
            lastPromotedAt: new Date().toISOString()
          });
          writeFileSync(filePath, updated, 'utf8');
          return parsed.data.proposalId ?? file.replace('.md', '');
        }
      }
    } catch { /* never crash */ }
  }

  const proposalId = `${Date.now()}-${specName.replace(/\//g, '-')}`;
  const proposalPath = join(proposalsDir(), `${proposalId}.md`);
  const frontmatter = [
    '---',
    `proposalId: ${proposalId}`,
    `specName: ${specName}`,
    `reason: "${reason.replace(/"/g, '\\"')}"`,
    `confidence: 0.3`,
    `createdAt: ${new Date().toISOString()}`,
    source ? `source: ${source}` : null,
    learningSignal ? `learningSignal: "${learningSignal.replace(/"/g, '\\"')}"` : null,
    '---'
  ].filter(Boolean).join('\n');

  writeFileSync(proposalPath, `${frontmatter}\n\n${newContent}`, 'utf8');
  return proposalId;
}

/**
 * Find a related spec file by keyword matching against error message content.
 * Used by buildRemediationBlock() to surface relevant spec references.
 * @param {string} errorMessage
 * @returns {string|null} Spec path + section hint, or null if none found
 */
export function findRelatedSpec(errorMessage) {
  const msg = (errorMessage ?? '').toLowerCase();
  const results = [];

  for (const domain of ['frontend', 'backend', 'testing']) {
    const dir = join(specsDir(), domain);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = readFileSync(join(dir, file), 'utf8');
        const parsed = matter(content);
        const tags = (parsed.data.tags ?? []).map(t => t.toLowerCase());
        const name = (parsed.data.name ?? file.replace('.md', '')).toLowerCase();
        // Score by tag and name keyword matches against the error message
        const score = tags.filter(t => msg.includes(t)).length +
          (msg.includes(name) ? 2 : 0);
        if (score > 0) {
          const specId = parsed.data.specId ?? null;
          const displayName = specId ? `${specId}  ${domain}/${file.replace('.md', '')}` : `${domain}/${file.replace('.md', '')}`;
          results.push({ displayName, score });
        }
      } catch { /* skip malformed */ }
    }
  }

  if (results.length === 0) return null;
  results.sort((a, b) => b.score - a.score);
  return results[0].displayName;
}

/**
 * Promote a proposal to an active spec.
 * @param {string} proposalId
 */
export function acceptProposal(proposalId) {
  const proposalPath = join(proposalsDir(), `${proposalId}.md`);
  if (!existsSync(proposalPath)) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  const parsed = matter(readFileSync(proposalPath, 'utf8'));
  const specName = parsed.data.specName;
  if (!specName || !specName.includes('/')) {
    throw new Error(`Invalid specName in proposal: ${specName}. Expected 'domain/name' format.`);
  }
  const [domain, name] = specName.split('/');
  writeSpec(domain, name, parsed.content);
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Full-text search across all spec files.
 * @param {string} query
 * @returns {Array<{ domain: string, name: string, excerpt: string }>}
 */
export function searchSpecs(query) {
  const q = query.toLowerCase();
  const results = [];

  function searchDir(dir, domain) {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(dir, file), 'utf8');
      if (content.toLowerCase().includes(q)) {
        const lines = content.split('\n');
        const matchLine = lines.find(l => l.toLowerCase().includes(q)) ?? '';
        results.push({ domain, name: file.replace('.md', ''), excerpt: matchLine.trim().slice(0, 120) });
      }
    }
  }

  for (const domain of ['frontend', 'backend', 'testing']) {
    searchDir(join(specsDir(), domain), domain);
  }
  return results;
}

// ── Injection ─────────────────────────────────────────────────────────────────

// ── Routing Map (v0.2.0) ─────────────────────────────────────────────────────

/**
 * Build a compact spec routing map for injection at agent spawn time.
 * Target size: under 150 tokens (~600 chars). Replaces full-spec injection.
 *
 * @param {string} taskDescription
 * @param {number|string} [phase]
 * @returns {string} Formatted routing map block
 */
export function buildRoutingMap(taskDescription, phase) {
  const relevantSpecs = getRelevantSpecs(taskDescription, phase);

  if (relevantSpecs.length === 0) {
    return [
      '── SPEC ROUTING MAP ─────────────────────────────────',
      `Task context: ${(taskDescription ?? '').slice(0, 80)}`,
      'No relevant specs found for this task.',
      'To fetch a spec by ID: call spec_fetch tool with spec ID.',
      '─────────────────────────────────────────────────────'
    ].join('\n');
  }

  const lines = [
    '── SPEC ROUTING MAP ─────────────────────────────────',
    `Task context: ${(taskDescription ?? '').slice(0, 80)}`,
    '',
    'Available specs (fetch by ID when needed):'
  ];

  for (const spec of relevantSpecs) {
    const specId = spec.data?.specId ?? null;
    const idStr = specId ? `[${specId}]` : '[SPEC:?]';
    const name = spec.data?.name ?? spec.name ?? 'Unknown';
    // One-line description: first non-empty content line after frontmatter
    const firstLine = (spec.content ?? '')
      .split('\n')
      .map(l => l.trim())
      .find(l => l && !l.startsWith('#')) ?? '';
    const desc = firstLine.slice(0, 60) || `${spec.domain} spec`;
    lines.push(`  ${idStr}  ${spec.domain}/${spec.name}  — ${desc}`);
  }

  lines.push('');
  lines.push('To fetch full spec: call spec_fetch tool with spec ID.');
  lines.push('─────────────────────────────────────────────────────');

  return lines.join('\n');
}

/**
 * Estimate the token cost of a routing map string.
 * @param {string} routingMap
 * @returns {number}
 */
export function getRoutingMapTokens(routingMap) {
  return Math.ceil((routingMap ?? '').length / CHARS_PER_TOKEN);
}

/**
 * Fetch full spec content by spec ID.
 * Called when an agent invokes the spec_fetch tool.
 * @param {string} specId - e.g. "SPEC:auth-001"
 * @returns {string} Full spec file content or error message
 */
export function fetchSpecById(specId) {
  if (!specId) return 'Error: No spec ID provided.';

  // Search all domain spec files for matching specId in frontmatter
  for (const domain of ['frontend', 'backend', 'testing']) {
    const dir = join(specsDir(), domain);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = readFileSync(join(dir, file), 'utf8');
        const parsed = matter(content);
        if (parsed.data.specId === specId) {
          return content;
        }
      } catch { /* skip */ }
    }
  }

  return `Spec ${specId} not found. Run /tw:specs reindex to rebuild index.`;
}

/**
 * Assign spec IDs to all spec files that don't have one.
 * IDs use format SPEC:<domain-short>-<NNN> (e.g. SPEC:auth-001).
 * Writes updated frontmatter back to each file.
 * @returns {number} Number of specs that received new IDs
 */
export function generateSpecIds() {
  const domainShorthand = { frontend: 'fe', backend: 'be', testing: 'test' };
  let assigned = 0;

  for (const domain of ['frontend', 'backend', 'testing']) {
    const dir = join(specsDir(), domain);
    if (!existsSync(dir)) continue;
    const short = domainShorthand[domain] ?? domain.slice(0, 4);
    let counter = 1;

    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      try {
        const filePath = join(dir, file);
        const content = readFileSync(filePath, 'utf8');
        const parsed = matter(content);
        if (!parsed.data.specId) {
          const newId = `SPEC:${short}-${String(counter).padStart(3, '0')}`;
          const updated = matter.stringify(parsed.content, {
            ...parsed.data,
            specId: newId
          });
          writeFileSync(filePath, updated, 'utf8');
          assigned++;
        }
        counter++;
      } catch { /* skip malformed */ }
    }
  }

  return assigned;
}

// ── Injection (legacy, deprecated in v0.2.0) ──────────────────────────────────

/**
 * Compose an injection string from spec files, respecting token budget.
 * @deprecated since v0.2.0. Use buildRoutingMap() + spec_fetch tool instead.
 * Kept for backward compatibility. Will be removed in v0.3.0.
 * @param {Array<{ domain: string, name: string, content: string, data: object }>} specFiles
 * @returns {string}
 */
export function buildInjectionBlock(specFiles) {
  if (!specFiles || specFiles.length === 0) return '';

  const maxChars = MAX_INJECTION_TOKENS * CHARS_PER_TOKEN;
  let totalChars = 0;
  const parts = ['## Injected Specs\n'];

  for (const spec of specFiles) {
    const section = `### ${spec.data?.name ?? spec.name} (${spec.domain})\n${spec.content}\n`;
    if (totalChars + section.length > maxChars) break;
    parts.push(section);
    totalChars += section.length;
  }

  return parts.join('\n');
}

/**
 * Estimate token count for a set of spec files.
 * @param {Array<{ content: string }>} specFiles
 * @returns {number}
 */
export function getSpecTokenCount(specFiles) {
  const totalChars = (specFiles ?? []).reduce((s, f) => s + (f.content?.length ?? 0), 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

// ── Index Rebuild ─────────────────────────────────────────────────────────────

/**
 * Rebuild the spec index from all spec files.
 */
function rebuildIndex() {
  const lines = ['# Spec Library Index\n'];
  for (const domain of ['frontend', 'backend', 'testing']) {
    const dir = join(specsDir(), domain);
    if (!existsSync(dir)) continue;
    const specs = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'index.md');
    if (specs.length === 0) continue;
    lines.push(`## ${domain}\n`);
    for (const file of specs) {
      try {
        const parsed = matter(readFileSync(join(dir, file), 'utf8'));
        const name = parsed.data.name ?? file.replace('.md', '');
        const updated = parsed.data.updated ?? 'unknown';
        const confidence = parsed.data.confidence ?? '?';
        lines.push(`- **${name}** — updated: ${updated}, confidence: ${confidence}`);
      } catch { /* skip malformed files */ }
    }
    lines.push('');
  }
  writeFileSync(join(specsDir(), 'index.md'), lines.join('\n'), 'utf8');
}
