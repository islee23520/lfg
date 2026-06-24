# src

TypeScript source for the `@islee23520/lfg` npm package.

`lfg` exists to port OpenCode OmO / lazycodex behavior from `oh-my-openagent` to GrokBuild. The npm CLI is the installer/control surface; `setup --run` materializes the lfg-owned Grok plugin payload under `~/.grok/plugins/lfg`. Keep the default setup path Grok-first and do not require `npx lazycodex-ai install` into `~/.codex`.

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| CLI command surface | `cli/` | Supports only `setup`; see `cli/AGENTS.md`. |
| Grok install engine | `grok/` | Installs/syncs the lfg Grok plugin payload under `~/.grok`; see `grok/AGENTS.md`. |
| Generated runtime | `../dist/` | Built output; change source, then rebuild. |
| Published bin shim | `../bin/lfg.js` | Shell shim that executes `../dist/lfg.js`. |
| User-facing skills | `../skills/` | Keep Grok-first `lfg setup` wording aligned. |

## CONVENTIONS

- Keep package behavior centered on Grok `~/.grok` install, not Codex `~/.codex` bootstrap.
- For OmO parity work, read the upstream OpenCode OmO implementation first, then implement the GrokBuild-native equivalent in lfg-owned source/assets.
- Keep JSON CLI output stable; tests assert exact fields.
- Only mutate user Grok files through explicit `setup --run` or confirmed interactive `setup`.
- Keep `lfgIsPlugin: false`; this is a JSON contract distinction, not a reason to avoid building the installed Grok plugin payload.
- Do not print API keys in JSON output, logs, or summaries.
