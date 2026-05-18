# Feature: `/autoresearch-goal` professor-critic state

## Goal

Provide an OMX-like autoresearch-goal entrypoint for LFG that records a durable research question, hypotheses, and professor-critic gate evidence.

## User contract

```text
/autoresearch-goal create "What is safest?" --hypotheses "A;B"
/autoresearch-goal critique --verdict pass --critic professor --evidence "sources verified"
/autoresearch-goal show
```

## Runtime contract

- Runtime command: `bin/lfg autoresearch-goal create/critique/show`
- MCP tool: `grok_build_autoresearch_goal`
- State path: `.lfg/runs/autoresearch-goal/*.json`
- Current pointer: `.lfg/state/current-autoresearch-goal.json`
- Gate status: `needs-critique`, `revise`, `blocked`, or `pass`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| autoresearch-goal create/critique/show persists critic gate state | `test_autoresearch_goal_create_critique_show` |
| MCP autoresearch-goal tool records professor-critic progress | `test_mcp_autoresearch_goal_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
