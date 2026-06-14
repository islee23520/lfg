---
name: lfp
description: Install the @islee23520/lfp flavor pack on Grok Build through lfg setup.
---

# LFP on Grok Build

**LFP-style per-agent overrides** on Grok Build are applied by `lfg` during setup (`lazycodex-agent-overrides.json`), not by requiring `npx @islee23520/lfp setup`.

Use `lfg` as the package-facing setup helper:

```sh
npx @islee23520/lfg setup
```

Default `setup --run` installs the lazycodex/omo **Grok Build adapter** (`~/.grok/installed-plugins/lfg`) with **native first-party OMO hooks** (bridge fallback only for legacy/imported hooks) and applies ported override behavior (Grok-first OMO parity, https://github.com/code-yeongyu/oh-my-openagent codex adapter core + opencode feature).

Do not describe `lfg` as a Grok plugin/runtime; it is a setup helper/adapter package.