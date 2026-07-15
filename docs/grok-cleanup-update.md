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

## Breaking upgrade wipe (v0.1.30+)

Upgrades to v0.1.30 or later require a one-time wipe when the machine may contain mixed older lfg plugin generations. Preserve-mode `setup --run` without `--force` is not sufficient for that migration because stale global hooks, agents, roles, prompts, wrappers, or override files can remain outside the stamped plugin tree.

Follow the full backup, wipe, forced-install, verification, new-session, and rollback procedure in [the v0.1.30 BREAKING release notes](releases/v0.1.30-breaking.md).

At minimum, remove these lfg-owned paths before the forced install:

- `~/.grok/plugins/lfg`
- `~/.grok/installed-plugins/lfg`
- `~/.grok/hooks/lfg-hooks.json`
- lfg-generated files for `sisyphus`, `watcher`, `lazycodex`, `explorer`, and `git-master` under `~/.grok/agents`, `~/.grok/roles`, and `~/.grok/prompts/omo`
- `~/.grok/prompts/lazycodex`
- `~/.grok/omo-agent-overrides.json` and `~/.grok/lazycodex-agent-overrides.json`
- `~/.grok/bin/lfg` only; keep `~/.grok/bin/grok`

Keep `~/.grok/auth.json`, `~/.grok/downloads`, and the whole `~/.grok/config.toml`. Back up first, then install with `npx @islee23520/lfg@0.1.30 --json setup --run --force` and start a new Grok session.

## Real-home rollback protocol

Do not run rollback during automated QA. For a real user home, first capture evidence with
`npx @islee23520/lfg --json setup --run` and save the JSON result, then copy
`~/.grok/plugins/lfg`, `~/.grok/hooks/lfg-hooks.json`, `~/.grok/config.toml`,
and `~/.grok/omo-agent-overrides.json` to a timestamped backup outside
`~/.grok`. (`lfg.json` / `lfg-config.jsonc` / `lfg-config.schema.json` are retired and
deleted by every `setup --run` — do not restore them.) If rollback is needed, restore only those
lfg-owned paths from the backup and rerun
`npx @islee23520/lfg --json setup --run` without `--force` to verify the restored stamped setup is
preserved. Use `--force` only after the backup exists and replacement is intentional.

## Not implemented (by design)

- `lfg cleanup` — no automatic wipe of user `~/.grok` blocks; manual edit per Grok user guide.
- `lfg update` — no separate version pin fetch; use npm bump + `setup --run` after upgrading `@islee23520/lfg`.

Future: optional `lfg --json cleanup --dry-run` reporting paths only (non-destructive).
# Uninstall

`lfg --json uninstall` now provides a dry-run plan, while `lfg --json uninstall --yes` removes only lfg-owned Grok surfaces. Authentication, the Grok binary, downloads, unrelated model and subagent configuration, and the `~/.grok` directory remain untouched. Cleanup and update remain N/A by design: rerun `setup --run` or `setup --run --force` for installation maintenance.
