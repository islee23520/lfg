---
name: lazycodex
description: Install or verify the lazycodex Codex adapter through the lazycodex-ai npm package.
---

# LazyCodex

Use this skill only as a thin installer helper for the lazycodex Codex adapter:

```sh
npx lazycodex-ai install
```

The local helper commands are:

```sh
npx @islee23520/lfg setup
npx @islee23520/lfg dry-setup
npx @islee23520/lfg doctor
```

Use `npx @islee23520/lfg setup` for the interactive shell installer. It confirms before executing:

```sh
npx lazycodex-ai install
```

Before running the installer, `lfg setup` checks for existing Grok lazycodex/agent settings and asks whether to overwrite them. If the installer changes those settings, `lfg` asks whether to restore the previous settings. After a successful installer run, `lfg` registers the Grok installed-plugin surface under the stable name `~/.grok/installed-plugins/lfg`. If the upstream installer creates a hash-like adapter directory, `lfg` links that target into the stable `lfg` name instead of asking users to rely on the temporary-looking path.

For automation, use:

```sh
npx @islee23520/lfg --json dry-setup
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --run
npx @islee23520/lfg --json doctor
```

Do not print API keys in summaries or JSON output.

After installation, verify lazycodex through the Grok surfaces that apply to the installed adapter:

```sh
grok models
grok -m <chosen-model-alias> -p 'Reply LFG_GROK_BUILD_OK'
grok inspect --json
grok plugin list --json
```

Grok may expose lazycodex as a custom model in `~/.grok/config.toml`, an agent/persona under `~/.grok/agents` or `.grok/agents`, ACP mode through `grok agent stdio`, MCP config, or a plugin under `~/.grok/plugins`.

Do not describe this helper as a Grok plugin. It also does not own a runtime.
