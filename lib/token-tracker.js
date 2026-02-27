/**
 * lib/token-tracker.js — Token budget management
 *
 * First-class feature. Tracks session token usage, surfaces threshold warnings
 * at 80% and 90%, reports estimation variance per task.
 * All state persisted to .threadwork/state/token-log.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TOKEN_LOG_VERSION = '1';
const DEFAULT_BUDGET = 800_000;

function tokenLogPath() {
  return join(process.cwd(), '.threadwork', 'state', 'token-log.json');
}

function ensureDir() {
  const dir = join(process.cwd(), '.threadwork', 'state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readLog() {
  const p = tokenLogPath();
  if (!existsSync(p)) {
    return { _version: TOKEN_LOG_VERSION, sessionBudget: DEFAULT_BUDGET, sessionUsed: 0, tasks: [] };
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { _version: TOKEN_LOG_VERSION, sessionBudget: DEFAULT_BUDGET, sessionUsed: 0, tasks: [] };
  }
}

function writeLog(data) {
  ensureDir();
  writeFileSync(tokenLogPath(), JSON.stringify({
    _version: TOKEN_LOG_VERSION,
    _updated: new Date().toISOString(),
    ...data
  }, null, 2), 'utf8');
}

// ── Estimation ────────────────────────────────────────────────────────────────

/**
 * Rough token estimate from text (chars / 4).
 * No API call needed.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil((text ?? '').length / 4);
}

/**
 * Heuristic task budget estimate based on description and phase.
 * @param {string} taskDescription
 * @param {number} [phase=1]
 * @returns {{ low: number, high: number, midpoint: number, complexity: string }}
 */
export function estimateTaskBudget(taskDescription, phase = 1) {
  const desc = (taskDescription ?? '').toLowerCase();
  const wordCount = desc.split(/\s+/).length;

  // Complexity heuristics
  const complexSignals = ['architect', 'refactor', 'migration', 'integration', 'authentication', 'auth', 'database', 'schema', 'multi', 'complex', 'redesign'];
  const simpleSignals = ['add', 'update', 'fix', 'rename', 'move', 'remove', 'delete', 'simple', 'small'];

  const complexScore = complexSignals.filter(s => desc.includes(s)).length;
  const simpleScore = simpleSignals.filter(s => desc.includes(s)).length;

  let complexity, low, high;

  if (complexScore >= 2 || wordCount > 20) {
    complexity = 'complex';
    low = 40_000;
    high = 80_000;
  } else if (simpleScore >= 2 || wordCount < 6) {
    complexity = 'simple';
    low = 5_000;
    high = 15_000;
  } else {
    complexity = 'medium';
    low = 15_000;
    high = 40_000;
  }

  // Planning phases cheaper than execution
  const multiplier = phase <= 1 ? 0.7 : 1.0;
  low = Math.round(low * multiplier);
  high = Math.round(high * multiplier);

  return { low, high, midpoint: Math.round((low + high) / 2), complexity };
}

// ── Budget Tracking ───────────────────────────────────────────────────────────

/**
 * Get the configured session budget (default 800K).
 * @returns {number}
 */
export function getSessionBudget() {
  return readLog().sessionBudget ?? DEFAULT_BUDGET;
}

/**
 * Set the session budget (called at init time with user's choice).
 * @param {number} budget
 */
export function setSessionBudget(budget) {
  const log = readLog();
  log.sessionBudget = budget;
  writeLog(log);
}

/**
 * Get estimated tokens consumed this session.
 * @returns {number}
 */
export function getSessionUsed() {
  return readLog().sessionUsed ?? 0;
}

/**
 * Get tokens remaining in this session.
 * @returns {number}
 */
export function getBudgetRemaining() {
  return Math.max(0, getSessionBudget() - getSessionUsed());
}

/**
 * Get 0–100 integer representing % of budget consumed.
 * @returns {number}
 */
export function getBudgetPercent() {
  const budget = getSessionBudget();
  if (budget === 0) return 100;
  return Math.min(100, Math.round((getSessionUsed() / budget) * 100));
}

/**
 * Check 80%/90% thresholds.
 * @returns {{ warning: boolean, critical: boolean }}
 */
export function checkThresholds() {
  const pct = getBudgetPercent();
  return { warning: pct >= 80, critical: pct >= 90 };
}

/**
 * Returns true if budget is below 20% remaining (trigger pre-task check).
 * @returns {boolean}
 */
export function shouldCheckBudget() {
  return getBudgetPercent() >= 80;
}

/**
 * Returns true if critically low (<10% remaining).
 * @returns {boolean}
 */
export function isOverBudget() {
  return getBudgetPercent() >= 90;
}

// ── Recording & Variance ──────────────────────────────────────────────────────

/**
 * Record token usage for a task. Adds to running session total.
 * @param {string} taskId
 * @param {number} estimatedTokens
 * @param {number} [actualTokens] If not provided, uses estimate as actual
 */
export function recordUsage(taskId, estimatedTokens, actualTokens) {
  const log = readLog();
  const actual = actualTokens ?? estimatedTokens;
  log.sessionUsed = (log.sessionUsed ?? 0) + actual;
  log.tasks = log.tasks ?? [];
  log.tasks.push({
    id: taskId,
    estimated: estimatedTokens,
    actual,
    variance: computeVariancePct(estimatedTokens, actual),
    rating: getVarianceRating(estimatedTokens, actual),
    recordedAt: new Date().toISOString()
  });
  writeLog(log);
}

/**
 * Compute variance percentage string (e.g. "+18%" or "-11%").
 * @param {number} estimated
 * @param {number} actual
 * @returns {string}
 */
function computeVariancePct(estimated, actual) {
  if (estimated === 0) return 'N/A';
  const pct = Math.round(((actual - estimated) / estimated) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Get variance quality rating.
 * @param {number} estimated
 * @param {number} actual
 * @returns {'Excellent' | 'Good' | 'Needs Improvement'}
 */
export function getVarianceRating(estimated, actual) {
  if (estimated === 0) return 'Needs Improvement';
  const absPct = Math.abs(((actual - estimated) / estimated) * 100);
  if (absPct < 10) return 'Excellent';
  if (absPct <= 20) return 'Good';
  return 'Needs Improvement';
}

/**
 * Get full budget and variance report for the current session.
 * @returns {object}
 */
export function getBudgetReport() {
  const log = readLog();
  const budget = log.sessionBudget ?? DEFAULT_BUDGET;
  const used = log.sessionUsed ?? 0;
  const remaining = Math.max(0, budget - used);

  const tasks = (log.tasks ?? []).map(t => ({
    id: t.id,
    estimated: t.estimated,
    actual: t.actual,
    variance: t.variance ?? computeVariancePct(t.estimated, t.actual),
    rating: t.rating ?? getVarianceRating(t.estimated, t.actual)
  }));

  const totalEstimated = tasks.reduce((s, t) => s + (t.estimated ?? 0), 0);
  const totalActual = tasks.reduce((s, t) => s + (t.actual ?? 0), 0);

  return {
    session: {
      budget,
      used,
      remaining,
      percent: Math.min(100, Math.round((used / budget) * 100))
    },
    tasks,
    phaseTotal: {
      estimated: totalEstimated,
      actual: totalActual,
      variance: computeVariancePct(totalEstimated, totalActual)
    }
  };
}

/**
 * Format a single-line budget dashboard string for hook injection.
 * @returns {string}
 */
export function formatBudgetDashboard() {
  const report = getBudgetReport();
  const { used, budget, remaining, percent } = report.session;
  const usedK = Math.round(used / 1000);
  const budgetK = Math.round(budget / 1000);
  const remainK = Math.round(remaining / 1000);

  const { warning, critical } = checkThresholds();
  let statusPart = '';
  if (critical) {
    statusPart = ' | 🚨 CRITICAL: >90% consumed — run /tw:done now';
  } else if (warning) {
    statusPart = ' | ⚠️ Warning: >80% consumed';
  }

  return `[TOKEN: ${usedK}K/${budgetK}K used | ${percent}% consumed | ${remainK}K remaining${statusPart}]`;
}

/**
 * Reset session usage to zero (call at session start).
 */
export function resetSessionUsage() {
  const log = readLog();
  log.sessionUsed = 0;
  log.tasks = [];
  writeLog(log);
}
