---
name: tw:new-project
description: Initialize a new project with clarifying questions — generates PROJECT.md, REQUIREMENTS.md, and ROADMAP.md
argument-hint: "[--from-prd <file>]"
allowed-tools: [Read, Write, Bash, Task, Glob]
---

## Preconditions
- `.threadwork/` must be initialized (run `threadwork init` first).
- For `--from-prd`: the specified file must exist and be readable.

## Action

### Step 1: Clarifying questions (skip if --from-prd)

Present the following 7 questions. Show all options clearly. Accept number (1–4) or free-text "Other: description".

**Q1. Project type:**
1. Web App (full-stack or frontend)
2. Mobile App (React Native, Flutter, etc.)
3. API / Backend service
4. CLI Tool / Library
Other: [describe]

**Q2. Primary language/framework:**
1. React + TypeScript (frontend/full-stack)
2. Next.js + TypeScript (full-stack)
3. Express / Fastify + Node.js (backend)
4. Python + FastAPI / Django (backend)
Other: [describe]

**Q3. Database:**
1. PostgreSQL
2. MySQL / MariaDB
3. SQLite
4. MongoDB
Other: [describe] / None

**Q4. Authentication approach:**
1. JWT (stateless)
2. Session-based (stateful)
3. OAuth 2.0 / OpenID Connect
4. None
Other: [describe]

**Q5. Team size:**
1. Solo (just me)
2. Small team (2–3 people)
3. Team (4–8 people)
Other: [describe]

**Q6. Deployment target:**
1. Vercel / Netlify (serverless/static)
2. Railway / Render / Fly.io (containers)
3. AWS / GCP / Azure (cloud)
4. Docker (self-hosted)
Other: [describe]

**Q7. Key constraints:** (free-text)
Budget limits, timeline, existing systems to integrate, APIs to use, anything the AI should NOT assume.

After all answers, summarize back:
"Here's what I understood:
- Project type: Web App
- Stack: Next.js + TypeScript
- Database: PostgreSQL
- Auth: JWT
...
Confirm or correct before I proceed. (yes to continue, or describe corrections)"

### Step 2: Research (if new domain)
Spawn `tw-researcher` to analyze the domain and identify:
- Standard patterns for this stack
- Common pitfalls to avoid
- Recommended library choices consistent with user's answers

### Step 3: Generate project files

Spawn `tw-planner` with all gathered context to generate:

**`.threadwork/state/PROJECT.md`**:
- Vision (2–3 sentences)
- Core principles (5–7 items)
- Tech stack (confirmed from Q2)
- Constraints (from Q7)

**`.threadwork/state/REQUIREMENTS.md`**:
- Functional requirements with REQ-001, REQ-002 format
- Non-functional requirements (performance, security, scalability)
- Explicitly out-of-scope items

**`.threadwork/state/ROADMAP.md`**:
```markdown
# Roadmap

## Milestone 1: Foundation
### Phase 1: Project setup + auth
### Phase 2: Core data model + API

## Milestone 2: Features
### Phase 3: ...
```

**`.threadwork/state/STATE.json`**: Machine-readable project state

### Step 4: Record spec decisions
For any framework/library decisions from Q1–Q7, write initial spec entries to `.threadwork/specs/`.

### Step 5: Initial commit
Commit all generated files: `git add -A && git commit -m "feat: initialize project with Threadwork"`

## Output on completion:
- Advanced: "Project initialized. Phase 1 ready to plan. Run /tw:discuss-phase 1 to start."
- Beginner: Full summary with explanation of each generated file and next steps.

## Error Handling
- `--from-prd` file missing: "File not found: <path>. Check the path and try again."
- User corrections in summary step: Re-present the summary after incorporating changes. Repeat until confirmed.
