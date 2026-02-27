/**
 * install/status.js — threadwork status command
 */

import { existsSync } from 'fs';
import { join } from 'path';

export async function runStatus() {
  const cwd = process.cwd();
  const stateDir = join(cwd, '.threadwork', 'state');

  if (!existsSync(stateDir)) {
    console.log("Threadwork is not initialized in this project. Run 'threadwork init' first.");
    return;
  }

  try {
    const { readState } = await import('../lib/state.js');
    const { getBudgetReport } = await import('../lib/token-tracker.js');
    const { getTier } = await import('../lib/skill-tier.js');
    const { checkpointExists } = await import('../lib/state.js');

    const state = readState();
    const budget = getBudgetReport();
    const tier = getTier();
    const hasCheckpoint = checkpointExists();

    console.log('\n── Threadwork Status ─────────────────────────────');
    console.log(`  Project:      ${state.projectName ?? 'Unknown'}`);
    console.log(`  Phase:        ${state.currentPhase ?? 0}`);
    console.log(`  Milestone:    ${state.currentMilestone ?? 0}`);
    console.log(`  Active task:  ${state.activeTask ?? 'None'}`);
    console.log(`  Skill tier:   ${tier}`);
    console.log(`  Token budget: ${(budget.session.used/1000).toFixed(0)}K / ${(budget.session.budget/1000).toFixed(0)}K (${budget.session.percent}%)`);
    if (hasCheckpoint) {
      console.log(`  ⚠ Recovery checkpoint found — run /tw:resume to restore`);
    }
    console.log('──────────────────────────────────────────────────\n');
  } catch (err) {
    console.error(`Error reading status: ${err.message}`);
  }
}
