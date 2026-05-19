# Feature: `/ralplan` consensus planning state

## Goal

Provide an OMX-like ralplan entrypoint for Grok Build that records consensus planning steps and architect review evidence before execution.

## User contract

```text
/ralplan create "Consensus plan" --steps "design;verify"
/ralplan review --verdict approve --reviewer architect --evidence "looks safe"
/ralplan show
```

## Runtime contract

- Runtime command: `bin/lfg ralplan create/review/show`
- MCP tool: `grok_build_ralplan`
- State path: `~/.grok/plugin-data/grok-build/runs/ralplan/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-ralplan.json`
- Consensus status: `pending`, `approve`, `revise`, or `block`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| ralplan create/review/show persists consensus state | `test_ralplan_create_review_show` |
| MCP ralplan tool records architect consensus review | `test_mcp_ralplan_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
