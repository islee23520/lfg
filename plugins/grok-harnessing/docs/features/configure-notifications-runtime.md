# Feature: `/configure-notifications` config state

## Goal

Provide an OMX-like notification configuration entrypoint for Grok Build. MVP stores dry-run notification preferences only; it does not send network notifications.

## User contract

```text
/configure-notifications set --channel console --target stdout --enabled
/configure-notifications show
```

## Runtime contract

- Runtime command: `bin/lfg configure-notifications set/show`
- MCP tool: `grok_build_notifications`
- State path: `~/.grok/plugin-data/grok-build/state/notifications.json`
- `dryRunOnly: true` until real notifiers are explicitly implemented.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| notification set/show persists config | `test_notifications_set_show_persists_config` |
| MCP notifications tool sets config | `test_mcp_notifications_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
