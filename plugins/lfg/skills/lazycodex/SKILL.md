---
name: lazycodex
description: Install lazycodex for Grok Build through the lfg npm package surface.
---

# LazyCodex

Use `lfg` only as the package-facing installer helper for this command:

```sh
npx @islee23520/lfg setup
```

That helper exists to run:

```sh
npx lazycodex-ai install
npx @islee23520/lfp setup
```

See also the `lfp` skill for the flavor pack role on Grok Build.

Interactive setup asks for the currently served OpenAI-compatible base URL,
fetches `/v1/models`, and maps discovered model ids before confirming install.

For automation, use:

```sh
npx @islee23520/lfg --json setup
npx @islee23520/lfg --json setup --base-url http://127.0.0.1:11434
npx @islee23520/lfg --json setup --run
```

Do not describe `lfg` as a plugin or runtime.
