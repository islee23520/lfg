# Feature: `/worker` task status state

## Goal

Provide an OMX-like worker protocol for LFG team mode: workers can ACK tasks, report results, and expose status durably.

## User contract

```text
/worker ack worker-1 "fix tests"
/worker result worker-1 "tests pass" --status complete
/worker status worker-1
```

## Runtime contract

- Runtime command: `bin/lfg worker ack/result/status`
- MCP tool: `grok_build_worker`
- State path: `.lfg/state/workers/*.json`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| worker ack/result/status persists state | `test_worker_ack_result_status` |
| MCP worker tool records ACK/result | `test_mcp_worker_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
