# Feature: `/cancel` workflow pointer clear

## Goal

Provide an OMX-like cancel command for LFG that clears active workflow pointers without deleting durable history.

## User contract

```text
/cancel
/cancel --scope goal,plan
```

## Runtime contract

- Runtime command: `bin/lfg cancel [--scope goal,plan,team,ultraqa|all]`
- MCP tool: `grok_build_cancel`
- Clears current pointers only:
  - `state/current-goal.json`
  - `state/current-plan.json`
  - `state/current-team.json`
  - `state/last-ultraqa.json`
- Writes `state/last-cancel.json` evidence.
- Does not delete durable `goals/`, `plans/`, `teams/`, `runs/`, or `wiki/` history.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| cancel clears current pointers and preserves durable history | `test_cancel_clears_current_pointers` |
| MCP cancel tool clears selected scope | `test_mcp_cancel_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
