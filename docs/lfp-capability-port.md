# LFP capability port (reference only)

**`@islee23520/lfp` is not shipped as-is inside `lfg`.** It is a **feature reference** for what to **re-implement** in the **omo Grok adapter** spinoff.

## Port vs drop

| LFP area (legacy) | Grok adapter action |
|-------------------|---------------------|
| Hook injection (visual / art-team guidance) | **Reimplement** against Grok `hooks/hooks.json` + `GROK_PLUGIN_*` env; drop Codex-only hook runners where Grok has no equivalent |
| Agent model-field overrides on upstream TOMLs | **Reimplement** for `~/.grok/agents/` + omo agent names; preserve “don’t wipe user reasoning” like omo `agents.mjs` |
| Extra helper agents (artistry, visual-engineering, etc.) | **Port selectively** — only agents that make sense on Grok Build; rewrite configs, don’t copy TOML verbatim if model IDs differ |
| `codex-plugin-install.mjs` / Codex marketplace `linalab` | **Do not port** — Grok uses `~/.grok` plugin layout from `grok-install` |
| OpenAI-compat / cliproxy provider blocks for **Codex** | **Replace** with lfg `LAZYCODEX_*` + `lfg-grok-config.ts` / Grok `[model.*]` |
| `cli.mjs` setup/doctor for Codex `CODEX_HOME` | **Replace** with `lfg setup` / `lfg doctor` targeting `~/.grok` |
| Sync scripts (`sync-agent-overrides.mjs`, etc.) | **Reimplement** as part of `runGrokInstall()` idempotent merge |

## Implementation home

- New code under `plugins/lfg/grok-install/` and `plugins/lfg/extensions/` (names TBD) — **not** a mirrored `plugins/lfg/lfp/` vendor tree.
- When borrowing logic, **rewrite** for Grok paths and omo spinoff branding; no Linalab ids.

## Tests

- Each ported capability gets a **new** vitest/node:test in lfg — do not depend on running legacy LFP test files unchanged.