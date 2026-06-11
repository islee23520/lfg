# plugins/lfg/bin

## OVERVIEW

Public CLI, JSON contract, publish/readiness helpers, and the densest test surface for the Grok-first adapter package.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI routing/help/output | `lfg.ts`, `lfg-command.ts`, `lfg-interactive.ts` | Only `setup` is supported. |
| Grok setup execution | `lfg-installer.ts` | Delegates to internal grok-install; default skips Codex install. |
| Setup JSON contract | `setup-json-contract.ts`, `lfg-setup-plan.test.ts`, `setup-json-contract.test.ts` | Keep field names stable. |
| Model discovery/mapping | `lfg-models.ts`, `lfg-models.*.test.ts`, `lfg-config.test.ts` | `/v1/models` mapping feeds config and agents. |
| Grok config output | `lfg-grok-config.ts`, `lfg-grok-config*.test.ts` | Never leak API keys. |
| Package/bin layout | `lfg-package-layout.ts`, `npm-publish-bin.ts`, `npm-registry-bin.ts`, `*pack*test.ts` | Root package shape is the publish contract. |
| Publish readiness | `publish-readiness.ts`, `npm-publish-auth.ts`, `record-publish-gap*.test.ts`, `pre-publish-check*.test.ts` | Keep checks deterministic and script-compatible. |
| Test harness | `test-process.ts` | Reuses built `dist/lfg.js`; many tests require build first. |

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
- Treating `plugins/lfg/package.json` as the publish source of truth.

## COMMANDS

```sh
npm run build
vitest run plugins/lfg/bin/*.test.ts
node plugins/lfg/dist/lfg.js --json setup
node plugins/lfg/dist/lfg.js --json setup --run
npm run assert-pack
npm run pre-publish-check
```
