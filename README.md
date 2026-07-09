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

## xai_grok MCP auth

Dedicated credentials (does not modify Grok host `~/.grok/auth.json`):

```sh
lfg xai auth status
lfg xai auth set-api-key --api-key "$XAI_API_KEY"
lfg xai auth set-oauth --access-token "$XAI_ACCESS_TOKEN" --refresh-token "$XAI_REFRESH_TOKEN" --expires-at "2099-01-01T00:00:00.000Z"
lfg xai auth logout
```

The `xai_grok` MCP server also exposes auth tools directly: `xai_auth_status`,
`xai_auth_set_api_key`, `xai_auth_set_oauth`, `xai_auth_refresh`, and
`xai_auth_logout`.

In Grok's `/mcps` modal, do not use the OAuth authenticate shortcut (`i`) for
`xai_grok`: it is a local stdio MCP server, while Grok host-managed OAuth is
only for HTTP/SSE MCP servers. Use the `xai_auth_*` MCP tools or the `lfg xai
auth ...` CLI commands instead.

## Optional MCP companion (`@islee23520/lfg-mcp`)

xAI + Z.AI MCP packages are best installed as an **independent companion plugin**,
not as part of the core lfg adapter:

```sh
# recommended: standalone companion
npx @islee23520/lfg-mcp setup
# or via lfg bridge (uses local ULW/lfg-mcp checkout or npx)
lfg mcp companion install
lfg mcp companion status
```

Companion owns:

| Package | Kind |
|---------|------|
| `xai` | local xAI Grok MCP runtime under `~/.grok/plugins/lfg-mcp` |
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

Prefer **`lfg-mcp`** when you want a real separate plugin tree + xAI runtime ownership.

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
