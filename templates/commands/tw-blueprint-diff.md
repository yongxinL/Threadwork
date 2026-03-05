# /tw:blueprint-diff — Blueprint Delta Analysis

Analyze blueprint changes, categorize impact, and estimate migration costs.

## Usage

```
/tw:blueprint-diff <file>                     — Analyze changes vs stored baseline
/tw:blueprint-diff --since-phase <N> <file>   — Analyze impact on remaining phases only
```

If no `<file>` is provided, reads from `REQUIREMENTS.md` + `ROADMAP.md` in the current directory.

## What This Command Does

1. Load the baseline blueprint with `loadLatestBlueprint()` from `lib/blueprint-diff.js`
2. If no baseline exists, print: "No baseline blueprint found — run `/tw:blueprint-lock` to establish one."
3. Read the new blueprint content from `<file>` (or REQUIREMENTS.md + ROADMAP.md)
4. Run `diffBlueprints(oldContent, newContent)` to categorize changes
5. Run `mapChangesToPhases(changes, projectState, sincePhase)` to map changes to project state
6. Run `estimateMigrationCosts(mapped, pricing)` to estimate options
7. Run `formatDiffReport({ changes, mapped, migration }, sincePhase)` and display
8. If user selects an option (A/B/C): write decision to `.threadwork/state/blueprint-migration.json`
   and snapshot the new blueprint as the next version with `lockBlueprint(newContent, 'Migration decision: Option X')`

## Notes

- This command is analysis and decision support only — it does NOT begin implementation
- After selecting an option, use `/tw:plan-phase` or other commands to implement accepted changes
- For `--since-phase <N>`, filter the output to show only changes affecting Phase N and later

## Output format

See blueprint-diff.js `formatDiffReport()` for the exact output structure.
