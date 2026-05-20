# Release tags

The plugin uses explicit LFG release tags so marketplace installs and release notes can refer to immutable points in history.

## Current release tag

```text
lfg-v0.4.0
```

This tag points at the OMO Agent Parity Lock for package:

```text
islee23520/lfg
```

## Stable release tag format

```text
lfg-v<plugin-version>
```

## Verification

Before publishing or announcing a tag, run:

```sh
git tag -v lfg-v0.4.0
```

Expected evidence:

```text
release-tag=ok tag=lfg-v0.4.0
```
