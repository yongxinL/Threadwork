/**
 * lib/state.js — Deterministic state management
 *
 * Pure JS file I/O over .threadwork/state/*.json.
 * No spawning processes, no Claude involvement.
 * All functions synchronous or async file operations only.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STATE_VERSION = '1';

/** @returns {string} Absolute path to .threadwork/state */
function stateDir() {
  return join(process.cwd(), '.threadwork', 'state');
}

/** @returns {string} Absolute path to a state file */
function statePath(filename) {
  return join(stateDir(), filename);
}

/**
 * Ensure the .threadwork/state directory exists.
 */
function ensureStateDir() {
  const dir = stateDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read and parse a JSON state file. Returns null if file does not exist.
 * @param {string} filename
 * @returns {object|null}
 */
function readJson(filename) {
  const p = statePath(filename);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    throw new Error(`Corrupted state file: ${p}. Delete it and run 'threadwork init' again.`);
  }
}

/**
 * Write a JSON state file with version + timestamp metadata.
 * @param {string} filename
 * @param {object} data
 */
function writeJson(filename, data) {
  ensureStateDir();
  const payload = {
    _version: STATE_VERSION,
    _updated: new Date().toISOString(),
    ...data
  };
  writeFileSync(statePath(filename), JSON.stringify(payload, null, 2), 'utf8');
}

// ── Project State ──────────────────────────────────────────────────────────────

/**
 * Read the top-level project state (project.json).
 * @returns {object}
 */
export function readState() {
  const state = readJson('project.json');
  if (!state) {
    throw new Error(
      "Cannot find .threadwork/state/project.json — run 'threadwork init' first."
    );
  }
  return state;
}

/**
 * Write the top-level project state.
 * @param {object} data
 */
export function writeState(data) {
  writeJson('project.json', data);
}

// ── Phase & Milestone ──────────────────────────────────────────────────────────

/** @returns {number} Current phase number */
export function getPhase() {
  return readState().currentPhase ?? 0;
}

/** @param {number} n Phase number */
export function setPhase(n) {
  const state = readState();
  state.currentPhase = n;
  writeState(state);
}

/** @returns {number} Current milestone number */
export function getMilestone() {
  return readState().currentMilestone ?? 0;
}

/** @param {number} n Milestone number */
export function setMilestone(n) {
  const state = readState();
  state.currentMilestone = n;
  writeState(state);
}

// ── Task Tracking ──────────────────────────────────────────────────────────────

/**
 * Append a task ID to the completed tasks log.
 * @param {string} taskId
 */
export function addCompletedTask(taskId) {
  const existing = readJson('completed-tasks.json') ?? { tasks: [] };
  existing.tasks.push({ id: taskId, completedAt: new Date().toISOString() });
  writeJson('completed-tasks.json', existing);
}

/**
 * Set the currently executing task.
 * @param {string} taskId
 * @param {string} planId
 */
export function setActiveTask(taskId, planId) {
  writeJson('active-task.json', { taskId, planId, startedAt: new Date().toISOString() });
}

/** Clear the active task (call on task completion). */
export function clearActiveTask() {
  writeJson('active-task.json', { taskId: null, planId: null, clearedAt: new Date().toISOString() });
}

// ── Requirements & Roadmap ─────────────────────────────────────────────────────

/**
 * Parse REQUIREMENTS.md and return structured array of requirements.
 * Expects lines like: `- REQ-001: Description`
 * @returns {Array<{id: string, description: string}>}
 */
export function readRequirements() {
  const reqPath = join(process.cwd(), '.threadwork', 'state', 'REQUIREMENTS.md');
  if (!existsSync(reqPath)) {
    throw new Error(
      "Cannot find .threadwork/state/REQUIREMENTS.md — run '/tw:new-project' first."
    );
  }
  const text = readFileSync(reqPath, 'utf8');
  const results = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*[-*]\s+(REQ-\d+):\s+(.+)/);
    if (match) {
      results.push({ id: match[1], description: match[2].trim() });
    }
  }
  return results;
}

/**
 * Parse ROADMAP.md into a milestone/phase/plan hierarchy.
 * @returns {Array<{milestone: number, phases: Array}>}
 */
export function readRoadmap() {
  const roadmapPath = join(process.cwd(), '.threadwork', 'state', 'ROADMAP.md');
  if (!existsSync(roadmapPath)) {
    throw new Error(
      "Cannot find .threadwork/state/ROADMAP.md — run '/tw:new-project' first."
    );
  }
  const text = readFileSync(roadmapPath, 'utf8');
  // Simple structure extraction — headings denote milestones/phases
  const milestones = [];
  let currentMilestone = null;
  for (const line of text.split('\n')) {
    const milestoneMatch = line.match(/^##\s+Milestone\s+(\d+):\s+(.+)/i);
    const phaseMatch = line.match(/^###\s+Phase\s+(\d+):\s+(.+)/i);
    if (milestoneMatch) {
      currentMilestone = { milestone: parseInt(milestoneMatch[1]), title: milestoneMatch[2].trim(), phases: [] };
      milestones.push(currentMilestone);
    } else if (phaseMatch && currentMilestone) {
      currentMilestone.phases.push({ phase: parseInt(phaseMatch[1]), title: phaseMatch[2].trim() });
    }
  }
  return milestones;
}

// ── Plan Files ─────────────────────────────────────────────────────────────────

/**
 * Read and parse a specific XML plan file.
 * Returns raw XML string for downstream parsing.
 * @param {string} planId e.g. "PLAN-1-1"
 * @returns {string}
 */
export function readPlan(planId) {
  const parts = planId.match(/PLAN-(\d+)-/);
  if (!parts) throw new Error(`Invalid plan ID format: ${planId}. Expected PLAN-N-M`);
  const phaseN = parts[1];
  const planPath = join(
    process.cwd(), '.threadwork', 'state', 'phases', `phase-${phaseN}`, 'plans', `${planId}.xml`
  );
  if (!existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }
  return readFileSync(planPath, 'utf8');
}

/**
 * List all plan files for a given phase.
 * @param {number} phaseN
 * @returns {string[]} Array of plan IDs
 */
export function listPlans(phaseN) {
  const plansDir = join(process.cwd(), '.threadwork', 'state', 'phases', `phase-${phaseN}`, 'plans');
  if (!existsSync(plansDir)) return [];
  return readdirSync(plansDir)
    .filter(f => f.endsWith('.xml'))
    .map(f => f.replace('.xml', ''));
}

/**
 * Mark a plan as complete in the state.
 * @param {string} planId
 */
export function markPlanComplete(planId) {
  const existing = readJson('completed-plans.json') ?? { plans: [] };
  existing.plans.push({ id: planId, completedAt: new Date().toISOString() });
  writeJson('completed-plans.json', existing);
}

// ── Git Info ──────────────────────────────────────────────────────────────────

/**
 * Returns current git branch, last commit SHA, and list of uncommitted files.
 * @returns {{ branch: string, sha: string, uncommitted: string[] }}
 */
export function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const uncommitted = execSync('git status --porcelain', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(l => l.slice(3).trim());
    return { branch, sha, uncommitted };
  } catch {
    return { branch: 'unknown', sha: 'unknown', uncommitted: [] };
  }
}

/**
 * Stage all changes and create a commit with the given message.
 * @param {string} message Commit message (conventional commits format)
 */
export function writeAtomicCommit(message) {
  execSync('git add -A', { stdio: 'inherit' });
  execSync(`git commit -m ${JSON.stringify(message)}`, { stdio: 'inherit' });
}

// ── Checkpoint ────────────────────────────────────────────────────────────────

/**
 * Write a recovery checkpoint.
 * @param {object} data
 */
export function writeCheckpoint(data) {
  writeJson('checkpoint.json', data);
}

/** @returns {object|null} */
export function readCheckpoint() {
  return readJson('checkpoint.json');
}

/** Clear the checkpoint after a phase completes cleanly. */
export function clearCheckpoint() {
  writeJson('checkpoint.json', { cleared: true });
}

/** @returns {boolean} */
export function checkpointExists() {
  const cp = readJson('checkpoint.json');
  return cp !== null && !cp.cleared;
}
