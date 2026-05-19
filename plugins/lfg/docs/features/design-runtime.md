# Feature: `/design` decision state

## Goal

Provide an OMX-like design/source-of-truth entrypoint for LFG that persists product and architecture decisions.

## User contract

```text
/design add "Team backend" "Use tmux windows" --rationale "durable coordination"
/design list
```

## Runtime contract

- Runtime command: `bin/lfg design add/list`
- MCP tool: `grok_build_design`
- State path: `.lfg/design/*.json`
- Current pointer: `.lfg/state/last-design.json`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| design add/list persists decision state | `test_design_add_list_persists_decision` |
| MCP design tool records decision | `test_mcp_design_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
