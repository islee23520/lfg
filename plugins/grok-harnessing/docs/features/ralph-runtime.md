# Feature: `/ralph` loop state

## Goal

Provide an OMX-like Ralph loop entrypoint for Grok Build that tracks bounded iterations, stop condition, and evidence durably.

## User contract

```text
/ralph create "iterate until tests pass" --max-iterations 3
/ralph step --status active --evidence "implemented first pass"
/ralph step --status complete --evidence "tests pass"
/ralph show
```

## Runtime contract

- Runtime command: `bin/lfg ralph create/step/show`
- MCP tool: `grok_build_ralph`
- State path: `~/.grok/plugin-data/grok-build/runs/ralph/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-ralph.json`
- MVP records loop state only; it does not auto-mutate files.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| ralph create/step/show persists loop state | `test_ralph_create_step_show` |
| MCP ralph tool records loop step | `test_mcp_ralph_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
