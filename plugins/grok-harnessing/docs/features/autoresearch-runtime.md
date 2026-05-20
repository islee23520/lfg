# Feature: `/autoresearch` research run state

## Goal

Provide an OMX-like autoresearch entrypoint for Grok Build that records research questions and source notes durably. MVP does not browse automatically; it stores evidence gathered by Grok or the user.

## User contract

```text
/autoresearch create "How should team mode work?"
/autoresearch add-source https://github.com/code-yeongyu/oh-my-openagent --note "reference workflow"
/autoresearch show
```

## Runtime contract

- Runtime command: `bin/lfg autoresearch create/add-source/show`
- MCP tool: `grok_build_autoresearch`
- State path: `~/.grok/plugin-data/grok-build/runs/autoresearch/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-research.json`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| create/add-source/show persists research state | `test_autoresearch_create_source_show` |
| MCP autoresearch tool records source evidence | `test_mcp_autoresearch_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
