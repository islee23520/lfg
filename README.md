# lfg

**GrokBuild port** and **omo/lazycodex Grok Build plugin** payload for Grok Build.

Lineage: upstream **codex adapter** core + **opencode** feature from
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent).

```sh
npx @islee23520/lfg setup
```

Installs into `~/.grok/plugins/lfg` (legacy `~/.grok/installed-plugins/lfg` fallback).

## Design (current)

**Grok is CEO + orchestrator. Codex is the worker.**

| Agent | Host | Job |
|-------|------|-----|
| **sisyphus** | Grok | CEO: goals, briefs, handoffs, synthesize RESULT. **No product edits. No solo technical judgment.** Always doubt self → task Codex. |
| **watcher** | Grok | Monitor residual / RESULT. Never invent pass/fail. |
| **lazycodex** | Grok read-only facade → **Codex CLI** (`engine gpt`) | Creates/attaches the external project thread; no in-host edits or spawn. |
| **explorer** | Grok | Light read-only orientation (paths/symbols). Not final judgment. |
| **git-master** | Grok (low-token model, e.g. `grok-3-mini-fast`) | **Git only** (status/diff/log/commit/history). Not product features. |

Permissions (forced on install):

- `sisyphus` / `watcher` / `explorer` → `permission_mode: plan`, `default_capability_mode: read-only`
- `lazycodex` → `permission_mode: plan`, `default_capability_mode: read-only`; external Codex performs product work
- `git-master` → execute for git operations only

Setup requires **Codex CLI** and aborts before modifying Grok when `codex` is absent. The TUI may offer only Codex installation recipes. **LazyCodex is the bundled read-only handoff facade**; setup never installs or runs `lazycodex-ai`.

## What it is

**`lfg` is the omo/lazycodex Grok Build plugin.** It materializes the supported lfg-owned OMO port (native hooks, CEO/orchestrator context, ultrawork context, ulw workflows, slim agent roles, MCP entries) under `~/.grok/plugins/lfg`. Deferred or unsupported upstream OMO components stay explicit in parity docs — not claimed as behavior-complete.

## When to run what / 언제 무엇을 실행하면 되나

| Situation | Command |
|---|---|
| First install (TUI: prereqs + models) | `npx @islee23520/lfg setup` |
| Sync models / preserve healthy existing install | `npx @islee23520/lfg setup --run` |
| Force reinstall or repair adapter tree | `npx @islee23520/lfg setup --run --force` |
| Refresh model list / safe model auth (no plugin tree change) | `npx @islee23520/lfg --json setup --refresh --run` |
| Health + prereqs | `npx @islee23520/lfg --json doctor` |
| Automation | `npx @islee23520/lfg --json setup --run` |

Interactive setup can discover models, confirm writes, check Codex/LazyCodex, and show step progress on the TUI spinner.

## Codex handoff (CEO → worker)

Grok plans; Codex implements. Parallel Codex threads are tracked under
`.omo/orchestrator/inbox.json`.

```sh
lfg --json handoff plan --role coding --engine gpt --focus "Add bounded retry"
# registers a planned thread in the orchestrator inbox

lfg --json orchestrator status   # poll RESULT files + CEO dashboard
lfg --json orchestrator watch    # app-server list/status + RESULT fallback
lfg --json orchestrator threads  # combined live + durable thread view
lfg --json orchestrator poll
lfg --json orchestrator ask --text "user stacked another request"
lfg --json orchestrator answer --ask-id ask-… --summary "what you told the user"
```

SessionStart / UserPromptSubmit hooks inject the inbox so Grok keeps watching
running threads, does not drop unanswered asks, and only answers after aggregating RESULT.
The injected `<lfg-always-on-monitors>` block is unconditional, including an empty inbox:
M1 asks, M2 RESULT paths, M3 app-server live threads, M4 residual asks, and M5 answer receipts.

GPT coding handoff uses app-server first and returns `handoff.launch` only as the honest `codex exec` fallback. See [skills/ulw-external-engine/SKILL.md](skills/ulw-external-engine/SKILL.md) and
[docs/grok-external-engine-orchestration.md](docs/grok-external-engine-orchestration.md).

Default external engine is **gpt → codex** only (retired multi-engine zoo is not the product path).

## Built-in xai_grok MCP (Grok enhanced search)

`lfg setup --run` registers core xAI tools under the plugin and
`~/.grok/config.toml` as `[mcp_servers.xai_grok]`:

| Tool | Purpose |
|------|---------|
| `xai_web_search` | Grok server-side web search |
| `xai_x_search` | X/Twitter search |
| `xai_generate_text` | Grok text |
| `xai_image_generate` / `xai_video_generate` / `xai_tts` | Media |
| `xai_auth_*` | MCP credential helpers |

No separate `@islee23520/lfg-mcp` install is required for these tools.

### xai_grok MCP auth

Dedicated credentials (does not rewrite Grok host `~/.grok/auth.json`):

```sh
lfg xai auth status
lfg xai auth detect
lfg xai auth set-api-key
lfg xai auth set-api-key --api-key "$XAI_API_KEY"
lfg xai auth set-oauth --access-token "$XAI_ACCESS_TOKEN" --refresh-token "$XAI_REFRESH_TOKEN" --expires-at "2099-01-01T00:00:00.000Z"
lfg xai auth logout
```

In Grok’s `/mcps` modal, do not use OAuth shortcut (`i`) for `xai_grok` (local stdio).
Use `xai_auth_*` tools or `lfg xai auth ...` instead.

## Optional MCP companion (`@islee23520/lfg-mcp`)

```sh
npx @islee23520/lfg-mcp setup
# or
lfg mcp companion install
lfg mcp companion status
```

| Package | Kind |
|---------|------|
| `xai` | optional second tree under `~/.grok/plugins/lfg-mcp` (usually unnecessary) |

## Commands

```sh
npx @islee23520/lfg setup
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --run
npx @islee23520/lfg setup --run --force
npx @islee23520/lfg --json doctor
lfg --json handoff plan --role coding --engine gpt --focus "…"
```

## Development

```sh
npm test
npm run self-test
npm run typecheck
npm run verify
```

Publish from the repository root, not from `src`.
