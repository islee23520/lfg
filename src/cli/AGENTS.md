# src/cli

## OVERVIEW

Public CLI, JSON contract, setup UI, model/config writers, publish/readiness helpers, and the densest test surface for the Grok-first adapter package.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI routing/help/output | `command/lfg.ts`, `command/lfg-command.ts` | Only `setup` is supported. Pure JSON helpers live in `src/shared/json.ts`. |
| Grok setup execution | `setup/lfg-installer.ts` | Delegates to internal grok-install; default skips Codex install. |
| Setup plan / interactive setup | `setup/setup-plan.ts`, `setup/lfg-interactive*.ts`, `setup/lfg-setup-tui*.ts` | Keep human output and JSON output separate. |
| Setup JSON contract | `setup-json-contract.ts`, `setup/lfg-setup-plan.test.ts`, `setup-json-contract.test.ts` | Keep field names stable. |
| Model discovery/mapping | `models/lfg-models.ts`, `models/lfg-models.*.test.ts`, `config/lfg-config.test.ts` | `/v1/models` mapping feeds config and agents. |
| Grok config output | `config/lfg-grok-config.ts`, `config/lfg-grok-config*.test.ts` | Never leak API keys. |
| Package/bin layout | `publish/layout/lfg-package-layout.ts`, `publish/bin/npm-publish-bin.ts`, `publish/registry/npm-registry-bin.ts`, `publish/pack/*pack*test.ts` | Root package shape is the publish contract. |
| Publish readiness | `publish/readiness/publish-readiness.ts`, `publish/auth/npm-publish-auth.ts`, `publish/readiness/record-publish-gap*.test.ts`, `publish/readiness/pre-publish-check*.test.ts` | Keep checks deterministic and script-compatible. |
| Test harness | `test/test-process.ts`, `test/test-model-server.ts` | Reuses built `dist/lfg.js`; many tests require build first. |
| Doc contracts | `docs-contract/` | Tests exact docs wording and path references. |

## CONVENTIONS

- Treat stdout/stderr, JSON keys, and help text as tested user-facing API.
- Bare `lfg setup` is interactive and owns its own human output; do not also dump raw JSON.
- `--json setup` is non-mutating. `--json setup --run` may mutate only through the installer path.
- Keep legacy `npx lazycodex-ai install` as reference/optional Codex bootstrap, not the default action.
- Test additions should prefer exact command/result assertions over broad snapshots.
- Pack/publish tests guard root tarball behavior; do not make them pass by weakening path assertions.

## ANTI-PATTERNS

- Adding new top-level commands beyond `setup`.
- Hiding filesystem writes behind dry-run or plan commands.
- Changing JSON wording/fields without updating contract tests and docs.
- Making tests rely on network or live npm registry unless the file is explicitly an integration check.
- Treating `package.json` as the publish source of truth.

## COMMANDS

```sh
npm run build
vitest run src/cli/*.test.ts src/cli/**/*.test.ts src/grok/*.test.ts src/grok/**/*.test.ts --exclude src/grok/skills/**/*.test.ts
node dist/lfg.js --json setup
node dist/lfg.js --json setup --run
npm run assert-pack
npm run pre-publish-check
```
