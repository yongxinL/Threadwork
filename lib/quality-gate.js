/**
 * lib/quality-gate.js — Quality gate runner
 *
 * Runs lint, typecheck, tests, build, and security scan.
 * Auto-detects available tools; skips gracefully if absent.
 * Caches results per git commit SHA.
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CACHE_PATH = () => join(process.cwd(), '.threadwork', 'state', '.gate-cache.json');

function readCache() {
  const p = CACHE_PATH();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

function writeCache(data) {
  mkdirSync(join(process.cwd(), '.threadwork', 'state'), { recursive: true });
  writeFileSync(CACHE_PATH(), JSON.stringify(data, null, 2), 'utf8');
}

function getCurrentSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return 'no-git';
  }
}

/**
 * Run a shell command and return structured result.
 * @param {string} cmd
 * @param {string} [cwd]
 * @returns {{ passed: boolean, output: string, exitCode: number }}
 */
function runCmd(cmd, cwd) {
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: cwd ?? process.cwd() });
  const output = ((result.stdout ?? '') + (result.stderr ?? '')).trim();
  return {
    passed: result.status === 0,
    output,
    exitCode: result.status ?? 1
  };
}

/**
 * Check if a command binary is available.
 * @param {string} bin
 * @returns {boolean}
 */
function commandExists(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

// ── Individual Gates ──────────────────────────────────────────────────────────

/**
 * Run TypeScript type checking.
 * @returns {{ passed: boolean, errors: string[] }}
 */
export function runTypecheck() {
  if (!existsSync(join(process.cwd(), 'tsconfig.json'))) {
    return { passed: true, skipped: true, errors: [], reason: 'No tsconfig.json found' };
  }
  if (!commandExists('tsc')) {
    return { passed: true, skipped: true, errors: [], reason: 'tsc not installed' };
  }
  const result = runCmd('tsc --noEmit');
  const errors = result.output
    .split('\n')
    .filter(l => l.includes('error TS'))
    .map(l => l.trim());
  return { passed: result.passed, errors };
}

/**
 * Run linting. Auto-detects eslint, biome, or oxlint.
 * @returns {{ passed: boolean, errors: string[] }}
 */
export function runLint() {
  let cmd = null;

  if (existsSync(join(process.cwd(), '.eslintrc.js')) ||
      existsSync(join(process.cwd(), '.eslintrc.json')) ||
      existsSync(join(process.cwd(), 'eslint.config.js')) ||
      existsSync(join(process.cwd(), 'eslint.config.mjs'))) {
    cmd = 'npx eslint . --max-warnings 0 --format compact';
  } else if (existsSync(join(process.cwd(), 'biome.json'))) {
    cmd = 'npx biome check .';
  } else if (commandExists('oxlint')) {
    cmd = 'oxlint .';
  }

  if (!cmd) {
    return { passed: true, skipped: true, errors: [], reason: 'No linter configured' };
  }

  const result = runCmd(cmd);
  const errors = result.output
    .split('\n')
    .filter(l => l.includes('error') || l.includes('Error'))
    .map(l => l.trim())
    .filter(Boolean);
  return { passed: result.passed, errors };
}

/**
 * Run tests.
 * @param {string} [filter] Optional test filter pattern
 * @returns {{ passed: boolean, failures: string[], coverage: number|null }}
 */
export function runTests(filter) {
  const pkg = join(process.cwd(), 'package.json');
  if (!existsSync(pkg)) {
    return { passed: true, skipped: true, failures: [], coverage: null, reason: 'No package.json found' };
  }

  let cmd = filter
    ? `npm test -- --testPathPattern=${JSON.stringify(filter)} --passWithNoTests`
    : 'npm test -- --passWithNoTests';

  // Detect test runner
  try {
    const pkgData = JSON.parse(readFileSync(pkg, 'utf8'));
    const scripts = pkgData.scripts ?? {};
    if (!scripts.test) {
      return { passed: true, skipped: true, failures: [], coverage: null, reason: 'No test script in package.json' };
    }
    if (pkgData.devDependencies?.jest || pkgData.dependencies?.jest) {
      cmd = filter
        ? `npx jest ${JSON.stringify(filter)} --passWithNoTests`
        : 'npx jest --passWithNoTests';
    } else if (pkgData.devDependencies?.vitest || pkgData.dependencies?.vitest) {
      cmd = filter ? `npx vitest run ${JSON.stringify(filter)}` : 'npx vitest run';
    }
  } catch { /* use npm test fallback */ }

  const result = runCmd(cmd);
  const failures = result.output
    .split('\n')
    .filter(l => l.includes('FAIL') || l.includes('✗') || l.includes('× '))
    .map(l => l.trim());

  // Try to extract coverage from output
  const coverageMatch = result.output.match(/(\d+(?:\.\d+)?)\s*%\s*(?:branch|statement|line|coverage)/i);
  const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : null;

  return { passed: result.passed, failures, coverage };
}

/**
 * Run build check.
 * @returns {{ passed: boolean, errors: string[] }}
 */
export function runBuild() {
  const pkg = join(process.cwd(), 'package.json');
  if (!existsSync(pkg)) {
    return { passed: true, skipped: true, errors: [], reason: 'No package.json found' };
  }
  try {
    const pkgData = JSON.parse(readFileSync(pkg, 'utf8'));
    if (!pkgData.scripts?.build) {
      return { passed: true, skipped: true, errors: [], reason: 'No build script in package.json' };
    }
  } catch { /* continue */ }

  const result = runCmd('npm run build');
  const errors = result.output
    .split('\n')
    .filter(l => l.includes('error') || l.includes('Error') || l.includes('ERROR'))
    .map(l => l.trim())
    .filter(Boolean);
  return { passed: result.passed, errors };
}

/**
 * Run security scan via npm audit.
 * @returns {{ passed: boolean, vulnerabilities: string[] }}
 */
export function runSecurityScan() {
  if (!existsSync(join(process.cwd(), 'package-lock.json')) &&
      !existsSync(join(process.cwd(), 'yarn.lock')) &&
      !existsSync(join(process.cwd(), 'pnpm-lock.yaml'))) {
    return { passed: true, skipped: true, vulnerabilities: [], reason: 'No lock file found' };
  }
  const result = runCmd('npm audit --audit-level high --json');
  let vulnerabilities = [];
  try {
    const data = JSON.parse(result.output);
    const vulns = data.vulnerabilities ?? {};
    vulnerabilities = Object.keys(vulns)
      .filter(k => ['high', 'critical'].includes(vulns[k].severity))
      .map(k => `${k} (${vulns[k].severity})`);
  } catch { /* audit output may not be JSON if errors */ }
  return { passed: result.passed, vulnerabilities };
}

// ── Run All ───────────────────────────────────────────────────────────────────

/**
 * Run all configured quality gates.
 * @param {{ build?: boolean, skipCache?: boolean }} [options]
 * @returns {{ passed: boolean, results: object[] }}
 */
export async function runAll(options = {}) {
  const sha = getCurrentSha();
  const cacheKey = `${sha}-${options.build ? 'build' : 'nobuild'}`;

  if (!options.skipCache) {
    const cache = readCache();
    if (cache[cacheKey]) {
      return { ...cache[cacheKey], cached: true };
    }
  }

  // Load quality config
  const configPath = join(process.cwd(), '.threadwork', 'state', 'quality-config.json');
  let config = {
    typecheck: { enabled: true, blocking: true },
    lint: { enabled: true, blocking: true },
    tests: { enabled: true, blocking: true },
    build: { enabled: false, blocking: false },
    security: { enabled: true, blocking: false }
  };
  if (existsSync(configPath)) {
    try { config = { ...config, ...JSON.parse(readFileSync(configPath, 'utf8')) }; } catch { /* use defaults */ }
  }

  const results = [];
  let allPassed = true;

  if (config.typecheck?.enabled !== false) {
    const r = runTypecheck();
    results.push({ gate: 'typecheck', ...r });
    if (!r.passed && !r.skipped && config.typecheck?.blocking !== false) allPassed = false;
  }

  if (config.lint?.enabled !== false) {
    const r = runLint();
    results.push({ gate: 'lint', ...r });
    if (!r.passed && !r.skipped && config.lint?.blocking !== false) allPassed = false;
  }

  if (config.tests?.enabled !== false) {
    const r = runTests();
    results.push({ gate: 'tests', ...r });
    if (!r.passed && !r.skipped && config.tests?.blocking !== false) allPassed = false;
  }

  if ((options.build || config.build?.enabled) && config.build?.enabled !== false) {
    const r = runBuild();
    results.push({ gate: 'build', ...r });
    if (!r.passed && !r.skipped && config.build?.blocking !== false) allPassed = false;
  }

  if (config.security?.enabled !== false) {
    const r = runSecurityScan();
    results.push({ gate: 'security', ...r });
    if (!r.passed && !r.skipped && config.security?.blocking !== false) allPassed = false;
  }

  const outcome = { passed: allPassed, results, ranAt: new Date().toISOString() };

  // Cache result
  const cache = readCache();
  cache[cacheKey] = outcome;
  writeCache(cache);

  return outcome;
}
