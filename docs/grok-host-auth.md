# Grok host authentication (#23)

`grok models` and headless CLI use **Grok Build** credentials in `~/.grok/auth.json` (OIDC). lfg does **not** write or repair `auth.json`.

## Symptoms (host)

- `WARN auth: failed to read auth.json` (e.g. missing `create_time`)
- Expired `expires_at` on stored tokens
- `You are not authenticated` / empty model list
- `Failed to fetch models: Auth("No API key for custom models endpoint. Set XAI_API_KEY.")`

## Mitigations

| Step | Action |
|------|--------|
| 1 | Fix config warnings: re-run `npx @islee23520/lfg --json setup --run` so `endpoints.api_key` is removed — see [`grok-config-endpoints.md`](grok-config-endpoints.md) (#24) |
| 2 | Interactive: run `grok` and complete sign-in to refresh `~/.grok/auth.json` |
| 3 | Headless BYOK: set `XAI_API_KEY` or `OPENAI_API_KEY` (and discovery base URL via `lfg setup --run`) |
| 4 | Verify adapter plan: `npx @islee23520/lfg --json setup`; materialize only with explicit `setup --run` |

## lfg scope

Adapter install (`runGrokInstall`, plugin tree, `config.toml` merge) is independent of Grok OIDC health. Issue #23 tracks **Grok CLI auth infrastructure**, not missing lfg code paths.
