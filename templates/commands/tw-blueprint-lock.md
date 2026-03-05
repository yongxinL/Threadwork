# /tw:blueprint-lock — Snapshot Blueprint Version

Snapshot the current blueprint content as a new versioned baseline.

## Usage

```
/tw:blueprint-lock [note]
```

Examples:
```
/tw:blueprint-lock
/tw:blueprint-lock "Added analytics requirements"
/tw:blueprint-lock "Pre-phase-3 checkpoint"
```

## What This Command Does

1. Identify the blueprint content to snapshot:
   - If a blueprint file path is provided in project.json, read that file
   - Otherwise read `REQUIREMENTS.md` + `ROADMAP.md` from project root (combined)
   - If neither exists, print an error message
2. Call `lockBlueprint(content, note)` from `lib/blueprint-diff.js`
3. Print confirmation: "Blueprint snapshotted as blueprint-v<N>.md"
4. List current versions with `listBlueprintVersions()`

## Output

```
✅ Blueprint snapshotted as blueprint-v2.md (note: "Added analytics requirements")

All versions:
  v1  2025-02-01  Initial
  v2  2025-02-20  Added analytics requirements (latest)

Use /tw:blueprint-diff <file> to analyze changes against this baseline.
```

## Notes

- Blueprint files are committed to git — they record design intent over time
- Run this before making multiple blueprint edits to establish a clean before/after baseline
- The note is optional but recommended for clarity in git history
