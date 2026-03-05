# /tw:model — Model Configuration and Switch Log

Show current model assignments and the switch log for this session. Optionally change the switch policy.

## Usage

```
/tw:model                         — Show model dashboard and session switch log
/tw:model policy <auto|notify|approve>  — Change switch policy mid-session
```

## Model Dashboard Format

```
── Model Configuration ──────────────────────────────────
Default context:   Sonnet 200K
Switch policy:     notify

Agent defaults:
  tw-planner        opus
  tw-researcher     opus
  tw-executor       sonnet
  tw-verifier       sonnet
  tw-plan-checker   sonnet
  tw-debugger       opus
  tw-dispatch       haiku
  tw-spec-writer    haiku
  tw-entropy-coll.  haiku

Switches this session: 1
  T-2-1-3  sonnet → opus  architectural task  [approved]
─────────────────────────────────────────────────────────
```

## Implementation Notes

1. Import `getAgentDefaults()`, `getSwitchLog()` from `lib/model-switcher.js`
2. Read `default_context` and `model_switch_policy` from `.threadwork/state/project.json`
3. Display the dashboard as shown above
4. For `/tw:model policy <mode>`: call `setSwitchPolicy(mode)` from `lib/model-switcher.js`

## Policy Descriptions

- `auto` — Switch automatically, notify after the fact (recommended for Ninja tier)
- `notify` — Propose switch with 10-second countdown, proceed unless interrupted (recommended for Advanced tier)
- `approve` — Always ask for explicit y/n confirmation before switching (recommended for Beginner tier)
