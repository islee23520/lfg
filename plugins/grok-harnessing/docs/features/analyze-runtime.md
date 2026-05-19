# Feature: `/analyze` lightweight repo analysis runtime

## Goal

Provide an OMX-like analyze entrypoint for Grok Build that persists a lightweight repo surface report.

## User contract

```text
/analyze create --focus "plugin surface"
/analyze list
```

## Runtime contract

- Runtime command: `bin/lfg analyze create/list`
- MCP tool: `grok_build_analyze`
- State path: `~/.grok/plugin-data/grok-build/runs/analyze/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/last-analyze.json`
- Captures file count, extension groups, key plugin paths, repo status, and summary.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| analyze create/list persists repo report | `test_analyze_create_list_persists_report` |
| MCP analyze tool creates report | `test_mcp_analyze_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
