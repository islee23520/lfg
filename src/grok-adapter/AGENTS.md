# src/grok-adapter

## OVERVIEW

Internal Grok installer engine: materializes the adapter payload, merges hooks, syncs agents/prompts, writes lfg-owned config, and verifies the installed Grok surface.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Top-level install transaction | `run-grok-install.ts` | Preserve stamped installs unless `--force`. |
| Payload materialization | `run-internal.ts`, `resolve-lazycodex-plugin-source.ts`, `install.ts` | Writes under `~/.grok/installed-plugins/lfg`. |
| Setup discovery | `resolve-setup-discovery.ts`, `resolve-global-agent-config.ts` | Reads CLI/env/config defaults. |
| Hook merge/trust | `extension-hooks.ts`, `normalize-plugin-hooks.ts`, `hook-trust.ts`, `assets/lfg-grok-hook-bridge.mjs` | Bridge wrapping must be idempotent. |
| Agent sync | `sync-lazycodex-agents-to-grok.ts`, `codex-agent-toml-to-grok.ts`, `apply-agent-tomls.ts` | Writes Grok role TOMLs and prompt files. |
| Agent overrides | `lazycodex-agent-overrides.ts`, `flavour-pack-assets/omo-agent-overrides.json` | Priority: user file > discovered config > bundled defaults. |
| Model/config reads | `read-grok-models-base-url.ts`, `read-lazycodex-agents-from-config.ts` | Config parsing must be conservative. |
| Post-install checks | `post-install-verify.ts`, `doctor*.ts`, `doctor-checks.ts` | Doctor output is also tested. |
| Fixtures/assets | `fixture-minimal/`, `flavour-pack-assets/`, `skills/` | Test/package payloads, not broad app code. |

## CONVENTIONS

- Only write to Grok home from explicit `setup --run` or confirmed interactive setup.
- Production setup must resolve Grok home from the real account home through `grok-home.ts` (`os.userInfo().homedir` first); never use inherited `HOME`, temp homes, or custom Grok-home env vars for real installs.
- Keep installer operations scoped to lfg-owned paths and config sections.
- Preserve healthy stamped installs by default; `--force` is the explicit replacement path.
- Make hook normalization repeat-safe. Multiple setup runs must not stack bridge wrappers.
- Keep bundled overrides Grok-first and deterministic.
- Fixture trees should stay minimal; add only files required by install/acceptance tests.
- Do not log secrets from env, config, or generated JSON.

## ANTI-PATTERNS

- Writing to `~/.codex` from this installer path.
- Silently wiping or replacing an existing healthy `~/.grok/installed-plugins/lfg` tree.
- Broadening install into unrelated Grok/Codex environment management.
- Letting generated TOML/JSON drift from tests or package assets.
- Adding fixture complexity that hides the install behavior under test.

## COMMANDS

```sh
npm run build
vitest run src/grok-adapter/*.test.ts
vitest run src/cli/lfg-grok-install.test.ts
node dist/lfg.js --json setup --run
node dist/lfg.js --json setup --run --force
```
