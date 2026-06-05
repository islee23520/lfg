# lfg

`lfg` means **lazycodex-flavoured grok-build**.

## What lfg does

`lfg` is an npm setup helper for Grok Build users who want the
lazycodex-flavoured path.

It does one job: run a machine-first lazycodex install, then make that
machine install visible to Grok by creating symbolic links under
`~/.grok/installed-plugins`.

The machine install is delegated to the upstream lazycodex installer:

```sh
npx lazycodex-ai install
```

After that installer completes, `lfg` locates the installed lazycodex
Codex adapter and links it into Grok with stable names such as `lfg` and
`lazycodex`.

## ULW Workflow

`lfg` is shaped for UltraWork Loop (ULW) style setup work: inspect the
plan first, keep dry checks non-mutating, and only change global Grok
state through an explicit setup run.

The intended flow is:

1. Inspect what will happen with `dry-setup`.
2. Check local readiness with `doctor`.
3. Run `setup --run` when you are ready to install and link lazycodex.

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

It does not replace `lazycodex-ai`. It calls the lazycodex installer and
then registers the resulting adapter for Grok.

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
