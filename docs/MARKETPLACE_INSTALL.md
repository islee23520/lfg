# Marketplace install source

`grok-build` is intended to be installed from Grok's `/plugins` marketplace flow.

## Exact marketplace source URLs

Stable marketplace source, used after `p1` is merged to `main`:

```text
https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json
```

Current `p1` preview marketplace source:

```text
https://raw.githubusercontent.com/islee23520/lfg/p1/.grok/plugins/marketplace.json
```

Agents/Claude-compatible marketplace metadata is also hosted at:

```text
https://raw.githubusercontent.com/islee23520/lfg/main/.agents/plugins/marketplace.json
https://raw.githubusercontent.com/islee23520/lfg/p1/.agents/plugins/marketplace.json
```

## Expected marketplace identity

```text
Marketplace: linalab-io-framework
Package:     linalab-io-framework/grok-build
Plugin id:   grok-build
Plugin path: plugins/grok-harnessing
Repository:  https://github.com/islee23520/lfg.git
Reference:   https://github.com/Yeachan-Heo/oh-my-codex
```

## Grok install flow

1. Open Grok Build.
2. Open `/plugins`.
3. Add the marketplace source URL.
4. Install `grok-build`.
5. Enable the plugin.
6. Verify skills, hooks, and MCP entries are visible.

## Verification

Local metadata and documentation gate:

```sh
scripts/verify-marketplace-source.sh
```

Remote `p1` raw GitHub gate:

```sh
scripts/verify-marketplace-source.sh --remote p1
```
