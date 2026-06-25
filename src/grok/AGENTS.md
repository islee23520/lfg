# src/grok

## OVERVIEW

Internal Grok installer engine: materializes the adapter payload, merges hooks, syncs agents/prompts, writes lfg-owned config, and verifies the installed Grok surface.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Top-level install transaction | `install/run-grok-install.ts` | Preserve stamped installs unless `--force`. |
| Internal payload setup | `install/run-internal.ts`, `install/run-grok-install-existing.ts`, `install/run-grok-install-post-sync.ts` | Fresh/forced and preserve branches must stay idempotent. |
| Setup discovery / Grok home | `install/resolve-setup-discovery.ts`, `install/resolve-global-agent-config.ts`, `install/grok-home.ts`, `install/grok-api-key.ts` | Reads CLI/env/config defaults; production home must use real account home. |
| Payload materialization | `payload/install.ts`, `payload/grok-adapter-paths.ts`, `payload/resolve-*.ts`, `payload/component-inventory.ts` | Writes under `~/.grok/plugins/lfg`; legacy `installed-plugins` is migration/fallback only. |
| Hook merge/trust | `hooks/extension-hooks.ts`, `hooks/normalize-plugin-hooks.ts`, `hooks/hook-trust.ts`, `assets/lfg-grok-hook-bridge.mjs` | Bridge wrapping must be idempotent. |
| Agent sync | `agents/sync-lazycodex-agents-to-grok.ts`, `agents/codex-agent-toml-to-grok.ts`, `agents/apply-agent-tomls.ts` | Writes Grok role TOMLs and prompt files. |
| Agent overrides | `agents/lazycodex-agent-overrides.ts`, `flavour/omo-agent-overrides.json` | Priority: user file > discovered config > bundled defaults. |
| Models/config reads | `models/read-grok-models-base-url.ts`, `agents/read-lazycodex-agents-from-config.ts`, `models/model-recommendations*.ts` | Config parsing must be conservative. |
| MCP/codegraph | `mcp/materialize-grok-mcp.ts`, `mcp/codegraph-*.ts`, `mcp/mcp-manifest-verify.ts` | Keep manifest-only vs behavioral ports honest. |
| Config/project awareness | `config/lfg-config.ts`, `config/project-local.ts`, `config/project-omo-ledger.ts` | Fail closed and avoid leaking ledger text. |
| Post-install checks / doctor | `doctor/post-install-verify.ts`, `doctor/doctor*.ts`, `doctor/doctor-checks.ts` | Doctor output is also tested. |
| Core ports | `ports/*.ts`, `ports/vendor/*` | Host-neutral vendored cores plus Grok glue. Do not broaden product runtime. |
| Fixtures/assets | `fixture/`, `flavour/`, `skills/`, `assets/` | Test/package payloads and installed hook assets; keep roots stable unless scripts/docs/tests all move with them. |
| Test support | `test/` | Shared adapter test helpers only. |

## CONVENTIONS

- Only write to Grok home from explicit `setup --run` or confirmed interactive setup.
- Production setup must resolve Grok home from the real account home through `install/grok-home.ts` (`os.userInfo().homedir` first); never use inherited `HOME`, temp homes, or custom Grok-home env vars for real installs.
- Keep installer operations scoped to lfg-owned paths and config sections.
- Preserve healthy stamped installs by default; `--force` is the explicit replacement path.
- Make hook normalization repeat-safe. Multiple setup runs must not stack bridge wrappers.
- Keep bundled overrides deterministic: OMO-equivalent primaries are allowed when discovered/configured, but Grok-compatible fallbacks must stay explicit.
- Fixture trees should stay minimal; add only files required by install/acceptance tests.
- Do not log secrets from env, config, or generated JSON.

## ANTI-PATTERNS

- Writing to `~/.codex` from this installer path.
- Silently wiping or replacing an existing healthy `~/.grok/plugins/lfg` tree.
- Broadening install into unrelated Grok/Codex environment management.
- Letting generated TOML/JSON drift from tests or package assets.
- Adding fixture complexity that hides the install behavior under test.

## COMMANDS

```sh
npm run build
vitest run src/cli/*.test.ts src/cli/**/*.test.ts src/grok/*.test.ts src/grok/**/*.test.ts --exclude src/grok/skills/**/*.test.ts
vitest run src/cli/lfg-grok-install.test.ts
node dist/lfg.js --json setup --run
node dist/lfg.js --json setup --run --force
```
