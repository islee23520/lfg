# Grok `cleanup` / `update` (lfg scope)

**Status:** Documented N/A for dedicated CLI in v0.1.x (parity row `cleanup` / `update`).

## omo-codex reference

Codex exposes passthrough cleanup/update on `~/.codex`. Grok Build uses `~/.grok` with plugin installs under `installed-plugins/`.

## lfg today

| Action | Surface |
|--------|---------|
| Re-install / refresh stamp + fixture tree | `npx @islee23520/lfg --json setup --run` (idempotent internal `runGrokInstall`) |
| Verify install | `npx @islee23520/lfg --json doctor` |
| Model/config merge | Same `setup --run` with `--base-url` when discovery needed |

## Not implemented (by design)

- `lfg cleanup` — no automatic wipe of user `~/.grok` blocks; manual edit per Grok user guide.
- `lfg update` — no separate version pin fetch; use npm bump + `setup --run` after upgrading `@islee23520/lfg`.

Future: optional `lfg --json cleanup --dry-run` reporting paths only (non-destructive).