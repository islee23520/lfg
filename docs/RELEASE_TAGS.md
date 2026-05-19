# Release tags

The plugin uses explicit LFG release tags so marketplace installs and release notes can refer to immutable points in history.

## Current preview tag

```text
lfg-v0.3.0-p1
```

This tag points at the `p1` hardening preview for package:

```text
islee23520/lfg
```

## Stable release tag format

```text
lfg-v<plugin-version>
```

Example after `p1` is merged to `main`:

```text
lfg-v0.3.0
```

## Verification

Before publishing or announcing a tag, run:

```sh
scripts/verify-release-tag.sh lfg-v0.3.0-p1
scripts/verify-release-tag.sh --remote lfg-v0.3.0-p1
```

Expected evidence:

```text
release-tag=ok tag=lfg-v0.3.0-p1
release-tag-remote=ok tag=lfg-v0.3.0-p1
```
