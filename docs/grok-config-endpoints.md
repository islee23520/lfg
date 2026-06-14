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
- Puts provider credentials under **`[model.*]`** sections as `api_key` from `OPENAI_API_KEY` / `XAI_API_KEY`, or from the active Codex provider token in `~/.codex/config.toml` when env is unset — not under `[endpoints]`.

Prefer **`OPENAI_API_KEY`** in the environment for headless use; the Codex config fallback is for local adapter installs where the proxy token already exists in `~/.codex/config.toml`.

## Related

Host OIDC / `auth.json` issues: [`grok-host-auth.md`](grok-host-auth.md) (#23).

## Migration

Re-run:

```sh
npx @islee23520/lfg --json setup --run --base-url <your-v1-base>
```

Or merge manually: delete `api_key` from `[endpoints]`; keep `models_base_url`.

## Tests

- `plugins/lfg/bin/lfg-grok-config.endpoints.test.ts`
- `plugins/lfg/grok-install/config-single-writer.acceptance.test.ts`
