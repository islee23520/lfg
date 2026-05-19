# Feature: `/ask` advisor request log

## Goal

Provide an OMX-like ask entrypoint for LFG that records external advisor requests and can optionally execute them. The default is dry-run for safety.

## User contract

```text
/ask create "review this architecture" --provider codex --dry-run
/ask list
```

## Runtime contract

- Runtime command: `bin/lfg ask create/list`
- MCP tool: `grok_build_ask`
- State path: `.lfg/runs/ask/*.json`
- Current pointer: `.lfg/state/last-ask.json`
- Dry-run records provider, prompt, and command without spending tokens or launching a tool.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| ask dry-run records advisor request | `test_ask_dry_run_records_request` |
| MCP ask tool records dry-run request | `test_mcp_ask_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
