# Feature: `/doctor` diagnostics runtime

## Goal

Provide an OMX-like doctor command for Grok Build that can quickly prove whether the plugin package, runtime, team backend prerequisites, and optional agent CLIs are discoverable.

## User contract

```text
/doctor
```

## Runtime contract

- Runtime command: `bin/lfg doctor`
- MCP query: `grok_build_runtime` with `{"action":"doctor"}`
- Required checks must pass for `status=pass`:
  - Grok plugin manifest exists
  - MCP config exists
  - OMX skill catalog exists and has the expected skill surface
  - Grok skill folders exist
  - `tmux` exists for team backend
  - plugin data path can be used
- Optional warnings include `hermes`, `claude`, `codex`, and `grok` executable discovery.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| doctor reports required checks | `test_doctor_reports_required_checks` |
| doctor is reachable through MCP runtime | `test_mcp_doctor_runtime` |

Current smoke coverage target: **100% of the matrix above must pass**.
