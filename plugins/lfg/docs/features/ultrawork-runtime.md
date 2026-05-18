# Feature: `/ultrawork` batch task state

## Goal

Provide an OMX-like ultrawork entrypoint for LFG that tracks a batch of task items and their evidence durably.

## User contract

```text
/ultrawork create "ship batch" --tasks "one;two"
/ultrawork update --task 1 --status complete --evidence "verified"
/ultrawork show
```

## Runtime contract

- Runtime command: `bin/lfg ultrawork create/update/show`
- MCP tool: `grok_build_ultrawork`
- State path: `.lfg/runs/ultrawork/*.json`
- Current pointer: `.lfg/state/current-ultrawork.json`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| ultrawork create/update/show persists task state | `test_ultrawork_create_update_show` |
| MCP ultrawork tool records task update | `test_mcp_ultrawork_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
