# Feature: `/pipeline` staged workflow runtime

## Goal

Provide an OMX-like pipeline command for Grok Build that tracks staged workflow progress with durable state.

## User contract

```text
/pipeline create "Ship feature" --stages "plan;build;verify"
/pipeline list
/pipeline update --id <pipeline-id> --stage 1 --status complete
```

## Runtime contract

- Runtime command: `bin/lfg pipeline create/list/update`
- MCP tool: `grok_build_pipeline`
- MCP runtime query: `grok_build_runtime` with `pipeline_list`
- State path: `~/.grok/plugin-data/grok-build/state/pipelines/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-pipeline.json`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| create/list/update persists staged pipeline state | `test_pipeline_create_list_update_persists_state` |
| MCP pipeline tool can create and update stages | `test_mcp_pipeline_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
