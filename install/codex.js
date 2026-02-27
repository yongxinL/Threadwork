/**
 * install/codex.js — Codex runtime installer
 *
 * Generates AGENTS.md with behavioral instructions (hook-equivalent),
 * quality check protocol, and session context resume instructions.
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Install Threadwork for Codex runtime.
 * @param {{ cwd: string, __dirname: string }} options
 */
export async function installCodex({ cwd }) {
  await generateAgentsMd(cwd);
  await generateContextResumeProtocol(cwd);
  console.log('  ✓ AGENTS.md generated with Threadwork behavioral instructions');
  console.log('  ✓ CONTEXT_RESUME.md protocol written');
}

async function generateAgentsMd(cwd) {
  const agentsMdPath = join(cwd, 'AGENTS.md');
  let existingContent = '';

  if (existsSync(agentsMdPath)) {
    existingContent = readFileSync(agentsMdPath, 'utf8');
    if (existingContent.includes('## Threadwork Context Protocol')) {
      console.log('  ✓ AGENTS.md already contains Threadwork section (skipping)');
      return;
    }
  }

  const threadworkSection = `
## Threadwork Context Protocol

These instructions are mandatory for all tasks in this project.

### Session Start Protocol
At the start of every task:
1. Check if \`.threadwork/state/checkpoint.json\` exists — if so, read it to restore context
2. Read the latest file in \`.threadwork/workspace/handoffs/\` for session history
3. Read \`.threadwork/state/project.json\` to get current phase, task, and skill tier

### Spec Loading Protocol
Before implementing any code:
1. Read \`.threadwork/specs/index.md\` for available spec domains
2. Load relevant spec files from \`.threadwork/specs/<domain>/\` based on the task type
3. Follow all patterns and standards defined in loaded specs

### Token Budget Protocol
Before starting any new task:
1. Read \`.threadwork/state/token-log.json\`
2. Check \`sessionUsed / sessionBudget\` ratio
3. If ratio ≥ 0.90: STOP — notify the user to run \`/tw:done\` before continuing
4. If ratio ≥ 0.80: Include a warning in your response and suggest wrapping up after the current task

### Quality Check Protocol
After completing any implementation task, before reporting done:
1. Run: \`node .threadwork/hooks/quality-check.js\` if it exists
2. OR manually run: typecheck, lint, and tests using the project's configured tools
3. Fix ALL errors before reporting the task as complete
4. Do not mark a task as done if any blocking quality gate fails

### Checkpoint Protocol
After completing each task:
1. Write the current state to \`.threadwork/state/checkpoint.json\`:
   \`\`\`json
   {
     "_version": "1",
     "_updated": "<ISO timestamp>",
     "phase": <N>,
     "milestone": <N>,
     "activeTask": "<task-id>",
     "branch": "<git-branch>",
     "lastSha": "<git-sha>"
   }
   \`\`\`

### Skill Tier Protocol
Read \`skillTier\` from \`.threadwork/state/project.json\`:
- \`beginner\`: Explain reasoning step-by-step. Include inline comments in all generated code.
- \`advanced\`: Concise. Summarize reasoning in 1–2 sentences. Comments for non-obvious logic only.
- \`ninja\`: Code only. No narration. No explanations unless explicitly asked.
`;

  const newContent = existingContent
    ? existingContent + '\n\n---\n' + threadworkSection
    : threadworkSection.trim();

  writeFileSync(agentsMdPath, newContent, 'utf8');
}

async function generateContextResumeProtocol(cwd) {
  const resumeProtocol = `# Threadwork Context Resume Protocol

This file documents how agents should restore context at the start of a new session.

## Resume Steps

1. **Read checkpoint**: \`.threadwork/state/checkpoint.json\`
2. **Read latest handoff**: Most recent file in \`.threadwork/workspace/handoffs/\`
3. **Read latest journal**: Most recent file in \`.threadwork/workspace/journals/\`
4. **Read project state**: \`.threadwork/state/project.json\`
5. **Announce readiness**:
   - Phase N, Milestone M
   - Last completed task: [task-id]
   - In progress: [task-id + description]
   - Token budget: [used]K / [total]K remaining
   - Skill tier: [tier]

## Output format
"\`\`\`
Threadwork context restored.
Phase: N | Milestone: M | Branch: branch-name
Last completed: T-N-M-K
In progress: T-N-M-K+1: description
Budget: 350K / 800K remaining (44%)
Skill tier: advanced
Ready. Continuing with: [next action]
\`\`\`"
`;
  writeFileSync(join(cwd, 'CONTEXT_RESUME.md'), resumeProtocol, 'utf8');
}
