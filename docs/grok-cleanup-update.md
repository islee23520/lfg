# Grok `cleanup` / `update` (lfg scope)

**Status:** Documented N/A for dedicated CLI in v0.1.x (parity row `cleanup` / `update`).

## omo-codex reference

Codex exposes passthrough cleanup/update on `~/.codex`. Grok Build uses `~/.grok` with the lfg adapter installed under native `src`; older `installed-plugins/` entries are treated as legacy migration/fallback state.

## lfg today

| Action | Surface |
|--------|---------|
| Sync models / preserve healthy stamped adapter tree | `npx @islee23520/lfg --json setup --run` (idempotent internal `runGrokInstall`) |
| Force re-install / replace adapter tree | `npx @islee23520/lfg --json setup --run --force` |
| Verify install | Re-run `npx @islee23520/lfg --json setup --run` and inspect the JSON result |
| Model/config merge | Same `setup --run` with `--base-url` when discovery needed |

## Not implemented (by design)

- `lfg cleanup` — no automatic wipe of user `~/.grok` blocks; manual edit per Grok user guide.
- `lfg update` — no separate version pin fetch; use npm bump + `setup --run` after upgrading `@islee23520/lfg`.

Future: optional `lfg --json cleanup --dry-run` reporting paths only (non-destructive).
