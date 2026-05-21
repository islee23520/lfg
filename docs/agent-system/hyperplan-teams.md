# C. Hyperplan-Style Rigorous Team Templates

## Goal
Port OmO's "hyperplan" concept — a pre-defined, high-rigor, adversarial team configuration — into LFG so users can easily launch teams that are structurally designed for excellent architectural and strategic outcomes.

## What Hyperplan Means in OmO (Summary)
- Special team name `"hyperplan"`
- Requires specific adversarial roles with designated reasoning levels (e.g., skeptic + "unspecified-low", validator + "unspecified-high", architect + "ultrabrain")
- Structured multi-round process (independent analysis → cross-attack → defend/refine)
- Strong validation that prevents weak team compositions
- Often combined with "ultrawork" for execution

## Current LFG Version (LFG + ULW flavored)

### Team Template Example: `hyperplan`

```json
{
  "name": "hyperplan",
  "description": "Adversarial high-quality architecture and strategy team (OmO Hyperplan inspired)",
  "required_roles": [
    { "agent": "sisyphus", "category": "unspecified-high" },
    { "agent": "atlas", "category": "unspecified-low" },
    { "agent": "sisyphus-junior", "category": "ultrabrain" }
  ],
  "adversarial_categories": ["unspecified-low", "unspecified-high", "artistry", "ultrabrain"],
  "workflow": "hyperplan-ultrawork",
  "min_members": 3,
  "validation_rules": [
    "must_include_skeptic_or_validator",
    "at_least_one_ultrabrain_or_deep"
  ]
}
```

### Usage

```sh
# Launch a hyperplan team for a major decision
lfg ultragoal spawn --template hyperplan "Redesign the core data platform"

# Or directly
lfg team create hyperplan "Evaluate three architecture options with maximum rigor"
```

The runtime will:
- Validate the team composition
- Inject the multi-round adversarial protocol into the prompts
- Force ULW identity + proper ledger reporting
- Use canonical OMO agents and category-backed critic lanes instead of the removed legacy custom lineup

## Benefits
- Users get OmO-level rigor without having to manually craft complex team specs every time.
- Encourages better outcomes on high-stakes work.
- Still fully customizable (users can define their own `hyperplan-v2`, `balanced-review`, etc.).

## Implementation Status (M13 Lock)

- [x] Store templates under `plugins/lfg/src/agents/` (done).
- [x] Add validation logic in the new TeamRuntime (done — `OMO_TEAM_ELIGIBILITY_REGISTRY`).
- [x] Wire into `ulw` and `team create` (done).
- [x] Support "hyperplan-ultrawork" combo mode (done — `ulw` skill).

This completes the A → B → C foundation requested.
