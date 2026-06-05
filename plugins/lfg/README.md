# lfg

`lfg` means **lazycodex-flavoured grok-build**.

It is a small npm setup helper for the `lazycodex` Codex adapter used by Grok Build. `lfg` installs lazycodex on the machine first, then registers that machine install for Grok by symbolic linking it under `~/.grok/installed-plugins`.

The underlying lazycodex install command is:

```sh
npx lazycodex-ai install
```

## Quick Start

Run the setup helper:

```sh
npx @islee23520/lfg setup
```

For non-interactive automation, run the installer explicitly:

```sh
npx @islee23520/lfg --json setup --run
```

That command runs `npx lazycodex-ai install`, finds the machine-installed lazycodex adapter, and links it into Grok using stable installed-plugin names such as `lfg` and `lazycodex`.

## Commands

```sh
npx @islee23520/lfg setup
npx @islee23520/lfg dry-setup
npx @islee23520/lfg doctor
```

JSON output is available for automation:

```sh
npx @islee23520/lfg --json dry-setup
npx @islee23520/lfg --json doctor
npx @islee23520/lfg --json setup --run
```

`dry-setup` and `doctor` do not mutate `~/.grok`. Global Grok state is only changed through an explicit setup run.

## Scope

`lfg` is not a Grok runtime, not a plugin runtime, and does not own the `lazycodex` runtime. It is the npm-facing adapter setup surface for Grok Build users who want the lazycodex-flavoured path.

## Package

Published package name:

```text
@islee23520/lfg
```

CLI binary:

```text
lfg
```

## Contact

Author: islee23520

Email: lysk9884@gmail.com
