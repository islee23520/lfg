# Marketplace install source

`lfg` is intended to be installed from Grok's `/plugins` marketplace flow.

Grok is Claude Code compatible: it reads Claude Code marketplaces, plugins, skills, MCPs, agents, hooks, and instruction files alongside `.grok/` with no extra setup. LFG therefore keeps the Claude/Agents-compatible metadata as a first-class reference surface, while `.grok/` remains the stable Grok marketplace alias.

## Exact marketplace source URLs

Stable marketplace source:

```text
https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json
```

Agents/Claude-compatible marketplace metadata is also hosted at:

```text
https://raw.githubusercontent.com/islee23520/lfg/main/.agents/plugins/marketplace.json
```

Both marketplace files must keep shared plugin fields aligned. The Grok file keeps Grok-specific schema identity; the Agents file carries the richer Claude-compatible metadata.

## Expected marketplace identity

```text
Marketplace: islee23520
Package:     islee23520/lfg
Plugin id:   lfg
Plugin path: plugins/lfg
Repository:  https://github.com/islee23520/lfg.git
```

## Grok install flow

1. Open LFG.
2. Open `/plugins`.
3. Add the marketplace source URL.
4. Install `lfg`.
5. Enable the plugin.
6. Verify skills, hooks, and MCP entries are visible.

## Verification

Local metadata and documentation gate:

```sh
bun plugins/lfg/bin/self-test.ts
```

Remote raw GitHub gate:

```sh
curl -s https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json | jq .
```

Reference docs:

- https://docs.x.ai/build/features/skills-plugins-marketplaces
