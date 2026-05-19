# Feature: `/performance-goal` evaluator state

## Goal

Provide an OMX-like performance-goal entrypoint for Grok Build that records evaluator-gated optimization metrics and pass/fail evidence durably.

## User contract

```text
/performance-goal create "reduce latency" --metrics "latency"
/performance-goal measure --metric latency --baseline 120 --current 80 --target 100 --evidence "bench ok"
/performance-goal show
```

## Runtime contract

- Runtime command: `bin/lfg performance-goal create/measure/show`
- MCP tool: `grok_build_performance_goal`
- State path: `~/.grok/plugin-data/grok-build/runs/performance-goal/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-performance-goal.json`
- Gate status: `needs-baseline`, `needs-measurement`, `fail`, or `pass`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| performance-goal create/measure/show persists metric gate state | `test_performance_goal_create_measure_show` |
| MCP performance-goal tool records measurement gate state | `test_mcp_performance_goal_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
