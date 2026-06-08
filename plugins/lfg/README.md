# lfg

**omo / lazycodex Grok Build adapter** (personal spinoff of the oh-my-openagent Codex line — not a Linalab product).

`lfg` is the npm setup helper for one job:

```sh
npx @islee23520/lfg setup
```

Default `setup --run` runs `npx lazycodex-ai install` then **internal** `@islee23520/lfg grok-install` (omo adapter on `~/.grok`). Legacy `@islee23520/lfp` setup is not required on the default path.

Parity roadmap: [`docs/grok-adapter-parity.md`](../../docs/grok-adapter-parity.md) (repo root).

## What lfg does

- Exposes the package-execution surface `npx @islee23520/lfg setup`
- Prompts for your currently served OpenAI-compatible base URL
- Fetches the `/v1/models` list and maps available models for lazycodex setup
- Confirms before running the upstream installers in interactive mode
- Supports non-interactive automation with `npx @islee23520/lfg --json setup --run`

## Commands

```sh
npx @islee23520/lfg setup
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --base-url http://127.0.0.1:11434
npx @islee23520/lfg --json setup --run
```

`lfg` is not a plugin, not a runtime, and not a replacement for `lazycodex-ai`.
