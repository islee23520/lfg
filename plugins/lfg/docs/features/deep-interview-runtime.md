# Feature: `/deep-interview` requirement intake state

## Goal

Provide an OMX-like deep interview entrypoint for LFG that records requirement questions and answers before implementation.

## User contract

```text
/deep-interview create "team mode requirements"
/deep-interview answer --question 1 "Launch tmux team with verification"
/deep-interview show
```

## Runtime contract

- Runtime command: `bin/lfg deep-interview create/answer/show`
- MCP tool: `grok_build_deep_interview`
- State path: `.lfg/interviews/*.json`
- Current pointer: `.lfg/state/current-interview.json`
- Defaults to three core requirement-gating questions.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| create/answer/show persists interview state | `test_deep_interview_create_answer_show` |
| MCP deep-interview tool records intake | `test_mcp_deep_interview_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
