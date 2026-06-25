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
