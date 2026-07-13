# src/cli

## OVERVIEW

Public CLI, JSON contract, setup UI, model/config writers, publish/readiness helpers, and the densest test surface for the Grok-first adapter package.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI routing/help/output | `command/lfg.ts`, `command/lfg-command.ts` | Supported: `setup`, `xai`. Pure JSON helpers in `src/shared/json.ts`. |
| Grok setup execution | `setup/lfg-installer.ts` | Delegates to `runGrokInstall`; see `setup/AGENTS.md`. |
| Setup plan / interactive | `setup/setup-plan.ts`, `setup/lfg-interactive*.ts`, `setup/lfg-setup-tui*.ts` | Keep human output and JSON output separate. |
| Setup JSON contract | `setup-json-contract.ts`, `setup-json-contract.test.ts` | Denylist + field stability. |
| Model discovery/mapping | `models/lfg-models.ts` | `/v1/models` feeds config and agents. |
| Grok config output | `config/lfg-grok-config.ts` (+ toml/sections) | Sole install-time writer for lfg-owned `config.toml` sections. Never leak API keys. |
| Package/bin layout | `publish/*` | See `publish/AGENTS.md`. Root package shape is the publish contract. |
| Publish readiness | `publish/readiness/`, `publish/auth/` | Deterministic gates; exit `2` when not-ready. |
| Test harness | `test/test-process.ts`, `test/test-model-server.ts` | Spawns built `dist/lfg.js`; many tests require build first. |
| Doc contracts | `docs/*-doc.test.ts` | 1:1 with repo `docs/<stem>.md` (not a `docs-contract/` folder). |
| xAI auth CLI | `xai/xai-auth-command.ts` | Secondary command surface; keep narrow. |

## CONVENTIONS

- Treat stdout/stderr, JSON keys, and help text as tested user-facing API.
- Bare `lfg setup` is interactive and owns its own human output; do not also dump raw JSON.
- `--json setup` is non-mutating. `--json setup --run` mutates only through the installer path.
- Keep legacy `npx lazycodex-ai install` as reference/optional Codex bootstrap, not the default action.
- Prefer exact command/result assertions over broad snapshots.
- Pack/publish tests guard root tarball behavior; do not weaken path assertions to land a change.

## ANTI-PATTERNS

- Adding new top-level commands without updating help, JSON contracts, and tests.
- Hiding filesystem writes behind dry-run or plan commands.
- Changing JSON wording/fields without updating contract tests and docs.
- Making tests rely on network or live npm registry unless the file is explicitly an integration check.
- Treating nested package manifests as publish source of truth (root `package.json` only).

## COMMANDS

```sh
npm run build
npm test
node dist/lfg.js --json setup
node dist/lfg.js --json setup --run
npm run assert-pack
node scripts/pre-publish-check.mjs
```
