# lfg

omo / lazycodex setup helper for **Grok Build**.

```sh
npx @islee23520/lfg setup
```

`lfg` installs the adapter into `~/.grok/installed-plugins/lfg` with hooks, agents, and model config. It does **not** run `npx lazycodex-ai install` into `~/.codex`.

## What it is

A small npm CLI for installing the omo/lazycodex Grok adapter as a real directory under `~/.grok`.

Not a Grok plugin. Not a runtime. Not a replacement for `lazycodex-ai`.

## When to run what

| Situation | Command |
|---|---|
| First install | `npx @islee23520/lfg setup` |
| Sync models / preserve healthy existing install | `npx @islee23520/lfg setup --run` |
| Force reinstall or repair adapter tree | `npx @islee23520/lfg setup --run --force` |
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

Publish from the repository root, not from `plugins/lfg`.
