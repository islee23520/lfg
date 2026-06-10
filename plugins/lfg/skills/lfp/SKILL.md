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

Default `setup --run` installs the lazycodex/omo adapter on `~/.grok` and applies ported override behavior.

Do not describe `lfg` as a plugin or as the LFP runtime.