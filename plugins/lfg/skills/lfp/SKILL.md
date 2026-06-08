---
name: lfp
description: Install the @islee23520/lfp flavor pack on Grok Build through lfg setup.
---

# LFP on Grok Build

**@islee23520/lfp** is the flavor pack that runs on Grok Build after the lazycodex adapter is installed.

Use `lfg` as the package-facing setup helper:

```sh
npx @islee23520/lfg setup
```

That runs, in order:

```sh
npx lazycodex-ai install
npx @islee23520/lfp setup
```

Do not install LFP alone through `lfg` without the lazycodex step; `lfg setup --run` always runs both upstream installers.

Do not describe `lfg` as a plugin or as the LFP runtime.