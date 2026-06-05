# lfg

`lfg` means **lazycodex-flavoured grok-build**.

It is a small npm setup helper for the `lazycodex` Codex adapter used by Grok Build. Its job is to install lazycodex on the machine first, then register that install for Grok by symbolic linking it under `~/.grok/installed-plugins`.

The underlying machine install command is:

```sh
npx lazycodex-ai install
```

## Use

Run the setup helper:

```sh
npx lfg setup
```

For automation, inspect the install plan without mutating global Grok state:

```sh
npx lfg --json dry-setup
npx lfg --json doctor
```

Run the installer explicitly:

```sh
npx lfg --json setup --run
```

That command runs `npx lazycodex-ai install`, finds the machine-installed lazycodex adapter, and links it into Grok using stable installed-plugin names such as `lfg` and `lazycodex`.

## Scope

`lfg` is not a Grok runtime and does not own the `lazycodex` runtime. It is the npm-facing adapter setup surface for Grok Build users who want the lazycodex-flavoured path.

Supported commands are:

- `setup`
- `dry-setup`
- `doctor`
