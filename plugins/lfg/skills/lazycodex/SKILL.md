---
name: lazycodex
description: Install or verify the lazycodex Codex adapter through the lazycodex-ai npm package, with optional Grok BYOK config help.
---

# LazyCodex

Use this skill only as a thin installer helper for the lazycodex Codex adapter:

```sh
npx lazycodex-ai install
```

The local helper commands are:

```sh
lfg install
lfg config grok-byok
lfg lazycodex status
lfg setup install-plan
```

Use `lfg install` for the interactive shell installer. It confirms before executing:

```sh
npx lazycodex-ai install
```

Before running the installer, `lfg install` checks for existing Grok lazycodex/agent settings and asks whether to overwrite them. If the installer changes those settings, `lfg` asks whether to restore the previous settings. After a successful installer run, `lfg` registers the Grok installed-plugin surface under the stable name `~/.grok/installed-plugins/lfg`. If the upstream installer creates a hash-like adapter directory, `lfg` links that target into the stable `lfg` name instead of asking users to rely on the temporary-looking path.

After the adapter question, it can also ask whether to configure Grok BYOK. That flow must ask the user to choose CLI proxy, CRI proxy, a custom OpenAI-compatible provider, or skip configuration. It must collect the base URL, API key, and model alias before writing `~/.grok/config.toml`. The upstream model id defaults to `gpt-5.5` unless the user or automation env overrides it.

For automation, use:

```sh
lfg --json install
lfg --json install --run
lfg --json config grok-byok
LFG_GROK_BASE_URL=... LFG_GROK_API_KEY=... LFG_GROK_MODEL_ALIAS=... lfg --json config grok-byok --run
```

Optional automation env:

```sh
LFG_GROK_BASE_URL=<chosen OpenAI-compatible base URL>
LFG_GROK_MODEL_ALIAS=<chosen Grok model alias>
LFG_GROK_MODEL_ID=gpt-5.5
LFG_GROK_DISPLAY_NAME="Grok Build BYOK"
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
