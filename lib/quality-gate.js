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

// ── Remediation Block ─────────────────────────────────────────────────────────

/**
 * Build a structured remediation block from quality gate failures.
 * Transforms every rejection into a teaching event: primary violation,
 * relevant spec reference, and a concrete fix template.
 *
 * @param {object} gateResults - Output from runAll() (with .results array)
 * @param {object} [specEngine] - Instance with findRelatedSpec(msg) method
 * @param {string} [skillTier] - 'beginner', 'advanced', or 'ninja'
 * @returns {{ primary_violation: string, relevant_spec: string, fix_template: string, learning_signal: string }}
 */
export function buildRemediationBlock(gateResults, specEngine, skillTier = 'advanced') {
  const results = gateResults?.results ?? [];

  // Priority: typecheck > lint > tests > build > security
  const priority = ['typecheck', 'lint', 'tests', 'build', 'security'];
  const failed = priority
    .map(gate => results.find(r => r.gate === gate && !r.passed && !r.skipped))
    .filter(Boolean);

  if (failed.length === 0) {
    return {
      primary_violation: 'Unknown failure',
      relevant_spec: 'None identified',
      fix_template: 'Review the quality gate output above for details.',
      learning_signal: 'Unclassified gate failure'
    };
  }

  const primary = failed[0];
  const errors = primary.errors ?? primary.failures ?? primary.vulnerabilities ?? [];
  const firstError = errors[0] ?? primary.output ?? 'No error details available';

  // Parse error by gate type to build a concrete fix template
  let primaryViolation = '';
  let fixTemplate = '';
  let learningSignal = '';

  if (primary.gate === 'typecheck') {
    // Parse: "src/auth.ts(42,5): error TS2339: Property 'token' does not exist on type 'User'"
    const match = firstError.match(/^([^(]+)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/);
    if (match) {
      primaryViolation = `TypeScript error ${match[3]}: ${match[4].trim()}`;
      fixTemplate = skillTier === 'ninja'
        ? `${match[1]}:${match[2]} — ${match[4].trim()}`
        : skillTier === 'beginner'
          ? `TypeScript found a type error at ${match[1]} line ${match[2]}.\n` +
            `Error: ${match[4].trim()}\n` +
            `Fix: Verify the type definition for the value you are accessing. ` +
            `Check the relevant type interface and ensure all properties exist before use.`
          : `Fix ${match[3]} at ${match[1]}:${match[2]}: ${match[4].trim()}`;
      learningSignal = `TypeScript ${match[3]} — ${match[4].split('.')[0].trim()}`;
    } else {
      primaryViolation = `TypeScript type error: ${firstError.slice(0, 120)}`;
      fixTemplate = skillTier === 'ninja'
        ? firstError.slice(0, 120)
        : `Resolve the TypeScript type error: ${firstError.slice(0, 200)}`;
      learningSignal = 'TypeScript type error pattern';
    }
  } else if (primary.gate === 'lint') {
    // Parse ESLint compact: "path/to/file.ts: line 10, col 5, Error - message (rule-name)"
    const match = firstError.match(/^(.+?):\s*line\s*(\d+).*?Error\s*-\s*(.+?)\s*\((.+?)\)$/);
    if (match) {
      primaryViolation = `Lint error (${match[4]}): ${match[3]}`;
      fixTemplate = skillTier === 'ninja'
        ? `${match[1]}:${match[2]} — ${match[3]} [${match[4]}]`
        : skillTier === 'beginner'
          ? `ESLint found a rule violation in ${match[1]} at line ${match[2]}.\n` +
            `Rule: ${match[4]}\nMessage: ${match[3]}\n` +
            `Fix: Address the linting rule violation. Run \`npx eslint ${match[1]} --fix\` for auto-fixable issues.`
          : `Fix lint rule ${match[4]} at ${match[1]}:${match[2]}: ${match[3]}`;
      learningSignal = `ESLint rule violation: ${match[4]}`;
    } else {
      primaryViolation = `Lint error: ${firstError.slice(0, 120)}`;
      fixTemplate = skillTier === 'ninja'
        ? firstError.slice(0, 120)
        : `Resolve the lint error: ${firstError.slice(0, 200)}`;
      learningSignal = 'Lint violation pattern';
    }
  } else if (primary.gate === 'tests') {
    // Parse test failure name
    const testNameMatch = firstError.match(/[✗×]\s*(.+)/);
    const testName = testNameMatch ? testNameMatch[1].trim() : firstError.slice(0, 80);
    primaryViolation = `Test failure: ${testName}`;
    fixTemplate = skillTier === 'ninja'
      ? `Test failed: ${testName}`
      : skillTier === 'beginner'
        ? `A test is failing: "${testName}"\n` +
          `Fix: Run the test in isolation to see the full error, check expected vs actual values, ` +
          `and ensure your implementation matches the test's contract.`
        : `Failing test: "${testName}" — check expected vs actual values and fix the implementation.`;
    learningSignal = `Test failure: ${testName.split('>')[0].trim()}`;
  } else {
    primaryViolation = `${primary.gate} failure: ${firstError.slice(0, 120)}`;
    fixTemplate = `Resolve the ${primary.gate} failure: ${firstError.slice(0, 200)}`;
    learningSignal = `${primary.gate} failure pattern`;
  }

  // Find related spec via spec engine keyword search
  let relevantSpec = 'None identified';
  if (specEngine && typeof specEngine.findRelatedSpec === 'function') {
    try {
      const found = specEngine.findRelatedSpec(firstError);
      if (found) relevantSpec = found;
    } catch { /* never crash */ }
  }

  return {
    primary_violation: primaryViolation,
    relevant_spec: relevantSpec,
    fix_template: fixTemplate,
    learning_signal: learningSignal
  };
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
