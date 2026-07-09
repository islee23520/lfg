# src

TypeScript source for the `@islee23520/lfg` npm package.

`lfg` ports OpenCode OmO / lazycodex behavior from `oh-my-openagent` to GrokBuild. The npm CLI is the installer/control surface; `setup --run` materializes the lfg-owned Grok plugin payload under `~/.grok/plugins/lfg`. Keep the default setup path Grok-first — do not require `npx lazycodex-ai install` into `~/.codex`.

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| CLI command surface | `cli/` | Only `setup` (+ `xai` auth helper). See `cli/AGENTS.md`. |
| Grok install engine | `grok/` | Materializes/syncs `~/.grok/plugins/lfg`. See `grok/AGENTS.md`. |
| Host-neutral OMO cores | `core/omo/` | model-core, rules-engine, prompts-core, agent-builder, delegate-core, boulder-state, skills-loader-core. See `core/AGENTS.md`. |
| lfg host-neutral helpers | `core/lfg/` | e.g. subagent spawn map. No Grok FS ownership. |
| Host capability types | `core/adapter/` | `HostAdapterCapabilities`; Grok fills in `grok/adapter/`. |
| Shared tiny types | `shared/` | `json.ts`, `coding-tool-adapter.ts` — used by both cli and grok. |
| Generated runtime | `../dist/` | Built output; change source, then rebuild. |
| Published bin shim | `../bin/lfg.js` | Shell shim → `../dist/lfg.js`. |
| User-facing skills | `../skills/` | Synced + hand-maintained trees; see `../skills/AGENTS.md`. |

## CONVENTIONS

- Grok-first: default setup targets `~/.grok`, not Codex `~/.codex` bootstrap.
- OmO parity work: read upstream OpenCode OmO first, then implement GrokBuild-native equivalent in lfg-owned source/assets.
- JSON CLI output is a contract; tests assert exact fields.
- Mutate user Grok files only via explicit `setup --run` or confirmed interactive `setup`.
- Keep `lfgIsPlugin: false` in JSON (npm package ≠ Grok plugin object); still install a real plugin payload.
- Never print API keys in JSON, logs, or summaries.
- Dependency direction: `cli`/`grok` → `core`/`shared` only. `core` must not import `cli` or `grok` (`core/core-boundary.test.ts`).

## ANTI-PATTERNS

- Hand-editing `dist/` or treating `src/grok/skills/**` as free-form source (managed by sync).
- Importing install/payload/skills paths into `src/core/**`.
- Adding top-level commands beyond the documented CLI surface without contract tests.
