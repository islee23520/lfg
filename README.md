# lfg

GrokBuild port and Grok Build plugin payload for **OpenCode OmO / lazycodex**.

```sh
npx @islee23520/lfg setup
```

`lfg` installs the adapter into `~/.grok/plugins/lfg` (with legacy `~/.grok/installed-plugins/lfg` fallback) with native first-party OMO hooks, Grok-native OMO agents (including Hephaestus-like default discipline plus lfg-owned Sisyphus and Atlas planning/research surfaces), and model config. Its lineage is the upstream **codex adapter** core and **opencode** feature from https://github.com/code-yeongyu/oh-my-openagent.

## What it is

**`lfg` is the omo/lazycodex Grok Build plugin.** It materializes the supported lfg-owned OMO port (native hooks, Sisyphus orchestration context, ultrawork context, ulw workflows, agent roles, and manifest-only MCP entries) as a real directory under `~/.grok/plugins/lfg`. Deferred or unsupported upstream OMO components stay explicit in the parity docs instead of being claimed as behavior-complete.

## When to run what / 언제 무엇을 실행하면 되나

| Situation | Command |
|---|---|
| First install | `npx @islee23520/lfg setup` |
| Sync models / preserve healthy existing install | `npx @islee23520/lfg setup --run` |
| Force reinstall or repair adapter tree | `npx @islee23520/lfg setup --run --force` |
| Refresh model list, context windows, and safe model auth (no plugin tree change) | `npx @islee23520/lfg --json setup --refresh --run` |
| Automation | `npx @islee23520/lfg --json setup --run` |

During interactive setup, `lfg` can read an OpenAI-compatible base URL, fetch `/v1/models`, map model aliases, and ask before writing files.

## Built-in xai_grok MCP (Grok enhanced search)

`lfg setup --run` **always** registers core xAI tools (the GrokBuild equivalent of
`codex-xai-oauth`) under `~/.grok/plugins/lfg` and mirrors them into
`~/.grok/config.toml` as `[mcp_servers.xai_grok]`:

| Tool | Purpose |
|------|---------|
| `xai_web_search` | Grok native server-side web search |
| `xai_x_search` | X/Twitter search |
| `xai_generate_text` | Grok text generation |
| `xai_image_generate` / `xai_video_generate` / `xai_tts` | Media |
| `xai_auth_*` | Dedicated MCP credential helpers |

No separate `@islee23520/lfg-mcp` install is required for these tools.

### xai_grok MCP auth

Dedicated credentials (does not modify Grok host `~/.grok/auth.json`):

```sh
lfg xai auth status
# Inspect the detection algorithm (no secrets printed)
lfg xai auth detect
# Auto-select best local CLI proxy credential and save it
lfg xai auth set-api-key
# Or explicit key / base URL
lfg xai auth set-api-key --api-key "$XAI_API_KEY"
lfg xai auth set-api-key --api-key "$KEY" --base-url "http://127.0.0.1:8317/v1"
lfg xai auth set-oauth --access-token "$XAI_ACCESS_TOKEN" --refresh-token "$XAI_REFRESH_TOKEN" --expires-at "2099-01-01T00:00:00.000Z"
lfg xai auth logout
```

Auto-detection algorithm (`lfg-xai-cli-proxy-detect/v1`):

1. **collect** — env keys, `~/.codex` providers, `~/.grok` model sections, opencode cliproxy, cliproxy-api-plus
2. **normalize** — validate URLs, fingerprint keys, dedupe `(baseUrl, keyFingerprint)`
3. **score** — source tier + preferred URL / known family / loopback bonuses
4. **probe** — short `GET {baseUrl}/models` (skip with `--no-probe`)
5. **select** — highest score among live candidates (or overall if none live)

The selected **base URL** is stored so `xai_grok` calls your local proxy (not only `api.x.ai`).

In Grok's `/mcps` modal, do not use the OAuth authenticate shortcut (`i`) for
`xai_grok`: it is a local stdio MCP server, while Grok host-managed OAuth is
only for HTTP/SSE MCP servers. Use the `xai_auth_*` MCP tools or the `lfg xai
auth ...` CLI commands instead. Host OIDC at `~/.grok/auth.json` is a read-only
fallback when no dedicated file is set.

## Optional MCP companion (`@islee23520/lfg-mcp`)

Z.AI packages (and an optional *separate* `lfg-mcp` plugin tree) can still use
the independent companion. Core **xai_grok is built into lfg** (see above).

```sh
npx @islee23520/lfg-mcp setup
# or via lfg bridge (uses local ULW/lfg-mcp checkout or npx)
lfg mcp companion install
lfg mcp companion status
```

Companion extras:

| Package | Kind |
|---------|------|
| `xai` | optional second tree under `~/.grok/plugins/lfg-mcp` (usually unnecessary) |
| `zai-vision` | `npx -y @z_ai/mcp-server` |
| `zai-web-search` / `web-reader` / `zread` | Z.AI remote HTTP MCPs |

## Z.AI MCP packages (lfg built-in helper)

lfg also ships a thin in-tree helper (`lfg zai …`) that writes the same
`[mcp_servers.zai-*]` style entries without installing the companion plugin:

```sh
lfg zai auth set-api-key --api-key "$Z_AI_API_KEY" --mode ZAI
lfg zai mcp install all
lfg zai mcp status
```

## Commands

```sh
npx @islee23520/lfg setup
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --base-url http://127.0.0.1:11434
npx @islee23520/lfg --json setup --preset grok
npx @islee23520/lfg --json setup --preset gpt
npx @islee23520/lfg --json setup --run
npx @islee23520/lfg setup --run
npx @islee23520/lfg setup --run --force
```

## Development

```sh
npm test
npm run self-test
npm run typecheck
npm run verify
```

Publish from the repository root, not from `src`.
