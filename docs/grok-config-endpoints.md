# Grok `config.toml` — `[endpoints]` keys (#24)

## Problem

Grok Build warns when `config.toml` contains `endpoints.api_key`:

```text
WARN config.toml has unrecognized key(s): endpoints.api_key
```

Legacy BYOK flows wrote `api_key` under `[endpoints]`; Grok only recognizes keys such as `models_base_url` in that section.

## lfg behavior (fixed)

`writeGrokModelConfig` (via `runGrokInstall` / `lfg setup --run`):

- Sets **`endpoints.models_base_url`** only in `[endpoints]`.
- **Removes** `endpoints.api_key` if present (including legacy files).
- Puts single-endpoint provider credentials under **`[model.*]`** sections as `api_key` from `OPENAI_API_KEY` / `XAI_API_KEY`, or from the active Codex provider token in `~/.codex/config.toml` when env is unset — not under `[endpoints]`.
- Omits that single global `api_key` from all `[model.*]` sections when discovery advertises provider-specific endpoints, because lfg cannot safely attribute one resolved credential to every provider URL.

Prefer **`OPENAI_API_KEY`** in the environment for headless single-endpoint use; the Codex config fallback is for local adapter installs where the proxy token already exists in `~/.codex/config.toml`.

## Related

Host OIDC / `auth.json` issues: [`grok-host-auth.md`](grok-host-auth.md) (#23).

## Migration

Re-run:

```sh
npx @islee23520/lfg --json setup --run --base-url <your-v1-base>
```

Or merge manually: delete `api_key` from `[endpoints]`; keep `models_base_url`.

## Global presets and reasoning effort

`lfg setup` no longer asks for each agent model individually. Interactive setup chooses one global preset, then derives OMO agent routing from the resulting `default` / `fast` / `reasoning` / `coding` routes.

Supported presets:

- `auto` (default): choose the best available Grok-first routes from the discovered catalog.
- `grok`: prefer Grok routes.

Use `--reasoning-effort auto|low|medium|high|xhigh` to control global reasoning effort for derived OMO agent roles. `auto` keeps role defaults (`explorer=low`, `coding=medium`, `reasoning=high`) instead of trusting model-advertised reasoning metadata.

## Multi-provider discovery

When discovery advertises provider-specific endpoints (e.g. via multi-endpoint provider discovery), generated `[model.*]` sections can carry provider-specific `base_url` values. In that mode, lfg does not write the single resolved global `api_key` into per-provider model sections. This is a multi-provider configuration surface without reading `~/.gjc` or changing the default single-endpoint setup path.

## Tests

- `src/cli/config/lfg-grok-config.endpoints.test.ts`
- `src/grok/config/config-single-writer.acceptance.test.ts`
