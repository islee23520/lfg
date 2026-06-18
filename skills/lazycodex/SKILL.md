---
name: lazycodex
description: Install the OpenCode OmO/lazycodex GrokBuild port through the lfg npm package surface.
---

# LazyCodex

Use `lfg` only as the package-facing installer helper for this command:

```sh
npx @islee23520/lfg setup
```

That helper installs the **omo / lazycodex GrokBuild port** and **Grok Build plugin payload** (core **codex adapter** + **opencode** feature from https://github.com/code-yeongyu/oh-my-openagent) on **Grok Build**. It installs **native first-party OMO hooks**, lfg-owned Sisyphus and Atlas planning/research agent surfaces, and uses **bridge fallback only for legacy/imported hooks** (`~/.grok/plugins/lfg`, agents, model config).

`lfg` **is** the Grok-native OMO plugin surface. See also the `lfp` skill for per-agent override ideas on Grok Build.

Interactive setup asks for the currently served OpenAI-compatible base URL,
fetches `/v1/models`, and maps discovered model ids before confirming install.

For automation, use:

```sh
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --base-url http://127.0.0.1:11434
npx @islee23520/lfg --json setup --run
```
