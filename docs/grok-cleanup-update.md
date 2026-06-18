# Grok `cleanup` / `update` (lfg scope)

**Status:** Documented N/A for dedicated CLI in v0.1.x (parity row `cleanup` / `update`).

## omo-codex reference

Codex exposes passthrough cleanup/update on `~/.codex`. Grok Build uses `~/.grok` with the lfg adapter installed under `~/.grok/plugins/lfg`; older `installed-plugins/` entries are treated as legacy migration/fallback state.

## lfg today

| Action | Surface |
|--------|---------|
| Sync models / preserve healthy stamped adapter tree | `npx @islee23520/lfg --json setup --run` (idempotent internal `runGrokInstall`) |
| Force re-install / replace adapter tree | `npx @islee23520/lfg --json setup --run --force` |
| Verify install | Re-run `npx @islee23520/lfg --json setup --run` and inspect the JSON result |
| Model/config merge | Same `setup --run` with `--base-url` when discovery needed |

## Real-home rollback protocol

Do not run rollback during automated QA. For a real user home, first capture evidence with
`npx @islee23520/lfg --json setup --run` and save the JSON result, then copy
`~/.grok/plugins/lfg`, `~/.grok/hooks/lfg-hooks.json`, `~/.grok/config.toml`,
`~/.grok/lfg-config.jsonc`, and `~/.grok/omo-agent-overrides.json` to a timestamped backup outside
`~/.grok`. If rollback is needed, restore only those lfg-owned paths from the backup and rerun
`npx @islee23520/lfg --json setup --run` without `--force` to verify the restored stamped setup is
preserved. Use `--force` only after the backup exists and replacement is intentional.

## Not implemented (by design)

- `lfg cleanup` — no automatic wipe of user `~/.grok` blocks; manual edit per Grok user guide.
- `lfg update` — no separate version pin fetch; use npm bump + `setup --run` after upgrading `@islee23520/lfg`.

Future: optional `lfg --json cleanup --dry-run` reporting paths only (non-destructive).
