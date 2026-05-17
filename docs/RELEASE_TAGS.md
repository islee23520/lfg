# Release tags

The plugin uses explicit Grok Build release tags so marketplace installs and release notes can refer to immutable points in history.

## Current preview tag

```text
grok-build-v0.3.0-p1
```

This tag points at the `p1` hardening preview for package:

```text
linalab-io-framework/grok-build
```

## Stable release tag format

```text
grok-build-v<plugin-version>
```

Example after `p1` is merged to `main`:

```text
grok-build-v0.3.0
```

## Verification

Before publishing or announcing a tag, run:

```sh
scripts/verify-release-tag.sh grok-build-v0.3.0-p1
scripts/verify-release-tag.sh --remote grok-build-v0.3.0-p1
```

Expected evidence:

```text
release-tag=ok tag=grok-build-v0.3.0-p1
release-tag-remote=ok tag=grok-build-v0.3.0-p1
```
