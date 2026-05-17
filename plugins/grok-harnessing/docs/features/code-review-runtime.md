# Feature: `/code-review` lightweight report runtime

## Goal

Provide an OMX-like code-review entrypoint for Grok Build that persists a lightweight review report from git evidence. This is not a replacement for the full reviewer workflow; it is a durable smoke/runtime layer.

## User contract

```text
/code-review create "review current changes"
/code-review list
```

## Runtime contract

- Runtime command: `bin/lfg code-review create/list`
- MCP tool: `grok_build_code_review`
- State path: `~/.grok/plugin-data/grok-build/runs/code-review/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/last-code-review.json`
- Captures changed files, git status, diff stat, recommendation, architect status, and findings.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| code-review create/list persists report state | `test_code_review_create_list_persists_report` |
| MCP code-review tool creates report | `test_mcp_code_review_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
