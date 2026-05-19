# Feature: `/ai-slop-cleaner` cleanup report state

## Goal

Provide an OMX-like cleanup/deslop entrypoint for Grok Build that records a scoped cleanup plan and fallback-signal scan without automatic edits.

## User contract

```text
/ai-slop-cleaner create --scope README.md --verification self-test
/ai-slop-cleaner list
```

## Runtime contract

- Runtime command: `bin/lfg ai-slop-cleaner create/list`
- MCP tool: `grok_build_cleanup`
- State path: `~/.grok/plugin-data/grok-build/runs/ai-slop-cleaner/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/last-cleanup.json`
- MVP records plan/evidence only; no automatic file edits.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| cleanup create/list persists report state | `test_cleanup_create_list_persists_report` |
| MCP cleanup tool creates report | `test_mcp_cleanup_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
