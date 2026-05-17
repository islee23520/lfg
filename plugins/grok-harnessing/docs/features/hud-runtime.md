# Feature: `/hud` workflow status summary

## Goal

Provide an OMX-like HUD command for Grok Build that summarizes current workflow state from durable plugin data.

## User contract

```text
/hud
/hud --text
```

## Runtime contract

- Runtime command: `bin/lfg hud [--text]`
- MCP tool: `grok_build_hud`
- MCP runtime query: `grok_build_runtime` with `hud`
- Summarizes goals, plans, teams, wiki notes, last UltraQA, and last cancel evidence.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| hud summarizes durable workflow counts | `test_hud_summarizes_workflow_state` |
| MCP hud tool returns summary | `test_mcp_hud_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
