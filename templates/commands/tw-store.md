# /tw:store — Cross-Session Memory Store

The Store is Threadwork's permanent knowledge base — patterns, edge cases, and conventions
proven across multiple projects and Ralph Loop cycles. It lives at `~/.threadwork/store/`
and is shared across all your Threadwork projects.

## Usage

```
/tw:store                    Show Store dashboard
/tw:store list               List all Store entries with confidence scores
/tw:store show <key>         Display a specific Store entry
/tw:store promote <id>       Promote a spec proposal to the Store
/tw:store prune              Remove low-confidence entries (below 0.4 threshold)
```

## Instructions

### `/tw:store` — Dashboard

Display the Store dashboard. Import `readStore` from `lib/store.js`.

Output:
```
── Threadwork Memory Store ─────────────────────────
Entries: <total>  |  patterns: <N>  |  edge-cases: <N>  |  conventions: <N>
Average confidence: <X.XX>

Top entries by confidence:
  [STORE:pat-001]  <key>    <confidence>  <domain>
  ...

Proposals approaching promotion (≥0.7 confidence):
  <proposalId>  <specName>  <confidence>  (<N> more cycles to auto-promote)

[If store is empty]
No Store entries yet. The Store accumulates as Ralph Loop findings are
accepted and promoted. Run /tw:specs proposals to see pending proposals.
────────────────────────────────────────────────────
```

### `/tw:store list` — Full List

List all Store entries. Import `readStore` from `lib/store.js`.

Output: table with columns `ID`, `Key`, `Domain`, `Confidence`, `Tags`.
Sort by confidence descending.

### `/tw:store show <key>` — Show Entry

Read a specific entry. Import `readEntry` from `lib/store.js` with the key.
Display the full entry content including frontmatter.

### `/tw:store promote <id>` — Manual Promotion

Promote a spec proposal to the Store, bypassing the confidence threshold.

1. Find the proposal file in `.threadwork/specs/proposals/<id>.md`
2. Import `promoteToStore` from `lib/store.js`
3. Call `promoteToStore({ filePath, content: proposalContent, manualPromotion: true })`
4. Display: `Promoted proposal <id> to Store as <entryId>`

### `/tw:store prune` — Remove Low-Confidence Entries

Remove entries below the 0.4 confidence threshold.

1. Import `pruneStore` from `lib/store.js`
2. Call `pruneStore(0.4)`
3. Display: `Pruned <N> entries below confidence 0.4`

## The Promotion Pipeline

```
Ralph Loop rejection
  → generates spec proposal in .threadwork/specs/proposals/ (confidence: 0.3)
  → developer accepts via /tw:specs accept <id> → confidence: 0.7
  → proposal survives 3+ sessions → auto-promoted to Store (confidence: 0.85)
  → Store entry injected into future sessions across all projects
```

Every Ralph Loop finding that survives review eventually becomes permanent knowledge.
Use `/tw:store promote <id>` to manually accelerate promotion for high-quality findings.

## Store vs Specs

| | Specs | Store |
|---|---|---|
| **Scope** | Project-specific conventions | Cross-project proven patterns |
| **Location** | `.threadwork/specs/` | `~/.threadwork/store/` |
| **Created by** | Manual authoring or spec-writer | Promotion from accepted proposals |
| **Injected** | Routing map at agent spawn | Compact block at session start |
| **Fetched** | `spec_fetch` tool | `store_fetch` tool |
