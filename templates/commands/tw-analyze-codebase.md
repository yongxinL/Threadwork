---
name: tw:analyze-codebase
description: Map a brownfield codebase — detect framework, generate architecture summary and starter spec library
argument-hint: ""
allowed-tools: [Read, Write, Bash, Glob, Grep, Task]
---

## Preconditions
- Must be run from the project root.
- `.threadwork/` must be initialized.

## Action

### Step 1: Auto-scan project root
Scan for configuration files (do not read full source files — only config files):
- `package.json` → detect JS/TS framework, test runner, linter
- `tsconfig.json` → TypeScript config, path aliases
- `next.config.js/ts` → Next.js detection
- `vite.config.js/ts` → Vite detection
- `pyproject.toml`, `setup.py` → Python project
- `Dockerfile` → containerization
- `prisma/schema.prisma` → Prisma ORM
- `drizzle.config.ts` → Drizzle ORM
- `.eslintrc.*`, `biome.json` → linter detection

### Step 2: Spawn analysis agent
Spawn `tw-researcher` with:
- Detected config file contents
- Directory tree (top 2 levels only, via `find . -maxdepth 2`)
- Instruction: generate architecture summary and spec entries

### Step 3: Write codebase map
Write `.threadwork/state/codebase-map.json`:
```json
{
  "detectedFramework": "Next.js",
  "language": "TypeScript",
  "testRunner": "jest",
  "linter": "eslint",
  "database": "PostgreSQL (via Prisma)",
  "auth": "NextAuth.js",
  "deployment": "Vercel",
  "directories": {
    "components": "src/components/",
    "api": "src/app/api/",
    "hooks": "src/hooks/",
    "utils": "src/lib/"
  }
}
```

### Step 4: Generate starter specs
Based on detected patterns, create initial spec entries:
- `frontend/react-patterns.md` — if React detected
- `backend/api-design.md` — if API routes detected
- `backend/auth.md` — if auth library detected
- `testing/testing-standards.md` — based on detected test runner

### Step 5: Output summary

**Advanced tier**:
```
── Codebase Analysis ─────────────────────────────
Framework:    Next.js 14 (App Router)
Language:     TypeScript
Database:     PostgreSQL via Prisma
Auth:         NextAuth.js
Test runner:  Jest
Linter:       ESLint

Key directories:
  Components: src/components/
  API:        src/app/api/
  Hooks:      src/hooks/

Specs generated: frontend/react-patterns, backend/api-design, backend/auth
Map saved: .threadwork/state/codebase-map.json
─────────────────────────────────────────────────
```

## Error Handling
- No recognized framework: Show what was detected and note that specs won't be auto-generated.
- Cannot read config files: List which files were inaccessible and suggest permissions check.
