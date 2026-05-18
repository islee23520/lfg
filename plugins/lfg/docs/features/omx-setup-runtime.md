# Feature: `/omx-setup` setup state

## Goal

Provide an OMX-like setup entrypoint for LFG that checks plugin installation files and records the marketplace install plan durably.

## User contract

```text
/omx-setup check
/omx-setup install-plan --marketplace linalab-io/lfg
/omx-setup show
```

## Runtime contract

- Runtime command: `bin/lfg omx-setup check/install-plan/show`
- MCP tool: `grok_build_omx_setup`
- State path: `.lfg/state/omx-setup.json`
- Setup checks cover plugin root, manifest, skills directory, MCP runtime, hooks directory, and data directory.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| omx-setup check/install-plan/show persists setup state | `test_omx_setup_check_plan_show` |
| MCP omx-setup tool records install-plan state | `test_mcp_omx_setup_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
