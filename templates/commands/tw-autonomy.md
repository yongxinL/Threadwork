---
name: tw-autonomy
description: Configure and inspect the autonomy level for this project
---

# /tw:autonomy

View or change the autonomy level for this project. Autonomy level controls how much human intervention the harness requires.

## Usage

```
/tw:autonomy            # Show current level and configuration
/tw:autonomy supervised # Set to supervised (default)
/tw:autonomy guided     # Set to guided
/tw:autonomy autonomous # Set to autonomous
```

## Autonomy Levels

| Level | Max Retries | Auto-Accept | Behavior |
|-------|-------------|-------------|----------|
| **supervised** | 5 | 0.7 | Human approval required for plans, reviews, and phase completions |
| **guided** | 8 | 0.6 | Auto-fills discuss-phase from prior context; human approves critical gates |
| **autonomous** | 10 | 0.5 | Fully autonomous; auto-approves plans and chains sessions without prompts |

## Safety Rails

The following actions are NEVER auto-approved regardless of autonomy level:
- `git push` / PR creation
- Destructive operations (`rm -rf`, `DROP TABLE`, etc.)
- Security-sensitive changes
- Budget overruns
- Quality gate configuration changes
- Autonomy level changes themselves

## Implementation

```javascript
import { readState, writeState } from '.threadwork/lib/state.js';
import { getAutonomyLevel, getAutonomySummary } from '.threadwork/lib/autonomy.js';

// Show current config
const summary = getAutonomySummary();
console.log(summary);

// Change level (requires explicit user confirmation)
const state = readState();
state.autonomyLevel = 'guided'; // or 'supervised' / 'autonomous'
writeState(state);
```

⚠️ **Autonomous mode** should only be used for well-understood phases with high spec coverage. Always ensure quality gates are configured before enabling autonomous mode.
