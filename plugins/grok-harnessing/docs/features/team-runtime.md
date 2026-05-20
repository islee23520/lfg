# Feature: `/team` tmux backend runtime

## Goal

Make `/team` the Grok-facing entrypoint for durable tmux-backed worker teams.

## Reference

Inspired by the `omx team` runtime in <https://github.com/code-yeongyu/oh-my-openagent>, adapted to Grok Build plugin conventions.

## User contract

```text
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>
```

## Runtime contract

- Slash text is parsed by `bin/lfg slash`.
- Team execution is handled by `bin/lfg team`.
- MCP exposes `grok_build_slash`, `grok_build_team`, and `grok_build_backend_start`.
- Default providers rotate through `hermes`, `claude`, and `codex`.
- Creation defaults to dry-run in MCP unless `dryRun:false` is explicit.
- State is written under `~/.grok/plugin-data/grok-build/state/teams/`.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| runtime status/catalog works | `test_status_and_catalog` |
| `/team` slash maps to providers | `test_team_slash_dry_run_maps_to_three_default_providers` |
| team state is durable | `test_team_lifecycle_state_dry_run` |
| MCP exposes slash/team runtime tools | `test_mcp_exposes_runtime_and_team_tools` |

Current smoke coverage target: **100% of the matrix above must pass**.
