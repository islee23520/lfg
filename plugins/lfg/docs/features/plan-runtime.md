# Feature: `/plan` structured plan runtime

## Goal

Provide an OMX-like planning command for LFG that creates durable checklist-style plan state before implementation work.

## User contract

```text
/plan create "Ship feature" --steps "design;test;implement;verify"
/plan list
```

## Runtime contract

- Runtime command: `bin/lfg plan create/list`
- MCP tool: `grok_build_plan`
- MCP runtime query: `grok_build_runtime` with `plan_list`
- State path: `.lfg/state/plans/*.json`
- Plans store title, ordered steps, timestamps, repo context, and path when listed.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| create/list persists structured plan steps | `test_plan_create_list_persists_steps` |
| MCP plan tool can create and list plans | `test_mcp_plan_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
