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

### Step 1: Product Discovery (skip if --from-prd)

Before asking any technical questions, run an open-ended product discovery conversation. Ask these questions **one at a time**, waiting for the user's answer before asking the next. Do not rush; use follow-up questions if answers are vague.

**D1. What are you building?**
Ask the user to describe the product in their own words. No options — free text only.
Example prompt: "Tell me about the project — what is it, and what problem does it solve?"

**D2. Who are the users?**
Who will use this? Are there multiple user roles (e.g. admin vs. customer)?
Example prompt: "Who are the target users? Are there different roles with different permissions or workflows?"

**D3. What are the core features?**
Ask for the 3–5 most important things the product must do. If the user gives a long list, help them prioritize.
Example prompt: "What are the most important things a user should be able to do? List the features that matter most for your MVP."

**D4. What does success look like?**
What is the MVP scope vs. what comes later?
Example prompt: "For your first release, what's the minimum that would make this useful? What are you intentionally leaving out for now?"

**D5. Any known constraints or integrations?**
Existing systems, third-party APIs, regulations, timeline pressure, things the AI should NOT assume.
Example prompt: "Are there any existing systems this needs to integrate with, APIs you must use, regulations to follow, or decisions already made that I should know about?"

After all 5 answers, summarize the product vision back to the user:

```
Here's what I understood about what you're building:

**Product**: [2–3 sentence summary]
**Users**: [who + roles]
**Core features**:
- [feature 1]
- [feature 2]
- [feature 3]
**MVP scope**: [what's in vs. out]
**Constraints**: [any known constraints]

Is this correct? Confirm or describe any corrections before we continue.
```

Repeat until the user confirms the product understanding is accurate.

---

### Step 2: Technical questions (skip if --from-prd)

Only proceed here after product discovery is confirmed. Present these 7 questions. Show all options clearly. Accept number (1–4) or free-text "Other: description".

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
Anything not already captured in product discovery: budget limits, timeline, APIs to use, things the AI should NOT assume.

After all answers, summarize back:
```
Here's what I understood:
- Project type: Web App
- Stack: Next.js + TypeScript
- Database: PostgreSQL
- Auth: JWT
- Team: Solo
- Deployment: Vercel
- Additional constraints: [from Q7]

Confirm or correct before I proceed. (yes to continue, or describe corrections)
```

---

### Step 3: Research (if new domain)
Spawn `tw-researcher` to analyze the domain and identify:
- Standard patterns for this stack
- Common pitfalls to avoid
- Recommended library choices consistent with user's answers

---

### Step 4: Generate project files

Spawn `tw-planner` with all gathered context — product discovery answers AND technical answers — to generate:

**`.threadwork/state/PROJECT.md`**:
- Vision (2–3 sentences derived from product discovery)
- Core principles (5–7 items)
- Tech stack (confirmed from Q2)
- Constraints (from D5 + Q7)

**`.threadwork/state/REQUIREMENTS.md`**:
- Functional requirements with REQ-001, REQ-002 format — derived directly from the core features identified in D3/D4
- Non-functional requirements (performance, security, scalability)
- Explicitly out-of-scope items (from MVP scope in D4)

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

---

### Step 5: Record spec decisions
For any framework/library decisions from Q1–Q7, write initial spec entries to `.threadwork/specs/`.

### Step 6: Initial commit
Commit all generated files: `git add -A && git commit -m "feat: initialize project with Threadwork"`

## Output on completion:
- Advanced: "Project initialized. Phase 1 ready to plan. Run /tw:discuss-phase 1 to start."
- Beginner: Full summary with explanation of each generated file and next steps.

## Error Handling
- `--from-prd` file missing: "File not found: <path>. Check the path and try again."
- User corrections in summary step: Re-present the summary after incorporating changes. Repeat until confirmed.
- Vague product discovery answers: Ask a targeted follow-up question rather than proceeding with assumptions.
