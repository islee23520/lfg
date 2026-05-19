# Feature: `/ultragoal` durable goal foundation (primitive layer)

> **Note:** The higher-level multi-goal `/ultragoal` experience (brief, stories, ledger, quality gates, `lfg ultragoal` commands) is documented in `ultragoal-runtime.md`. This file now only describes the backing primitive `goal` used by ultragoal and other workflows.

## Goal

Provide durable goal state for Grok Build workflows. This is the primitive layer that `ultragoal` builds multi-goal plans on top of.

## User contract

```text
/ultragoal create "Ship feature" --checklist "design;test;verify"
/ultragoal list
/ultragoal update --id <goal-id> --status complete --note "verified"
```

## Runtime contract

- Runtime command: `bin/lfg goal create/list/update`
- MCP tool: `grok_build_goal`
- State path: `~/.grok/plugin-data/grok-build/state/goals/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-goal.json`
- Goals store objective, checklist, status, timestamps, repo context, and event history.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| create/list/update persists durable goal state | `test_goal_create_list_update_persists_state` |
| MCP goal tool can create and update goal state | `test_mcp_goal_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
