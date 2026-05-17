# Feature: `/autopilot` strict workflow state

## Goal

Provide an OMX-like autopilot entrypoint for Grok Build that records the strict `ralplan -> ralph -> code-review` loop as durable workflow state.

## User contract

```text
/autopilot create "ship strict loop"
/autopilot advance --phase 1 --status complete --evidence "plan ok"
/autopilot show
```

## Runtime contract

- Runtime command: `bin/lfg autopilot create/advance/show`
- MCP tool: `grok_build_autopilot`
- State path: `~/.grok/plugin-data/grok-build/runs/autopilot/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-autopilot.json`
- Strict phase order: `ralplan`, then `ralph`, then `code-review`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| autopilot create/advance/show persists ordered phase state | `test_autopilot_create_advance_show` |
| MCP autopilot tool records strict phase progress | `test_mcp_autopilot_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
