# Feature: `/ultraqa` adversarial smoke runtime

## Goal

Provide an OMX-like UltraQA entrypoint for LFG that creates adversarial QA scenarios, optionally executes verification commands, and persists run evidence.

## User contract

```text
/ultraqa "verify plugin install and MCP smoke"
```

## Runtime contract

- Runtime command: `bin/lfg ultraqa <objective> [--no-run]`
- MCP tool: `grok_build_ultraqa`
- State path: `.lfg/runs/ultraqa-*.json`
- Current pointer: `.lfg/state/last-ultraqa.json`
- Default no-run MCP behavior is safe planning; explicit runtime may execute detected verification commands.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| ultraqa no-run creates durable planned run state | `test_ultraqa_no_run_persists_run_state` |
| MCP ultraqa tool creates planned run state safely | `test_mcp_ultraqa_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
