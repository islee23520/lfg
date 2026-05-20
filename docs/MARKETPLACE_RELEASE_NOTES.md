# Marketplace release notes

## lfg 0.4.0 — OMO Agent Parity Lock

Release tag: `lfg-v0.4.0`

Package: `islee23520/lfg`
Marketplace source: `https://github.com/islee23520/lfg.git`
Stable marketplace URL: `https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json`
Reference model: [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)

### What ships

- **OMO Agent Hierarchy**: Full port of the 11 canonical OMO agents (Sisyphus, Hephaestus, Prometheus, Atlas, etc.) as first-class Grok-model agents.
- **Grok Spawn Adapter**: Unified delegation surface for spawning OMO agents with category-aware model resolution and mandatory Grok Oracle review.
- **Durable OMO State**: Boulder, continuation, mailbox, tasklist, and plans stored under `.lfg/` with schema versioning.
- **Team Mode & Hyperplan**: Durable multi-agent orchestration with adversarial planning templates and local tmux observability.
- **Aligned Surfaces**: CLI, MCP, and slash skills (`ulw`, `plan`, `start-work`, `team`) all route through the OMO parity runtime.
- **Evidence-Class Honesty**: Docs and runtime distinguish between current fallback behavior and manual-gated native Grok spawning.

### Required release evidence

A release candidate must pass the following evidence gates before tagging or merging:

```text
manifest-and-file-checks=ok
marketplace-metadata=ok
release-notes=ok
marketplace-source=ok
hook-smoke=ok
todo-continuation=ok
ruff-check=ok
mcp-smoke=ok
mcp-stdio-isolation=ok
mcp-stderr-isolated=ok
state-schema-versioning=ok
state-schema-doctor=ok
team-dry-run=ok
models-auth=ok
team-tmux-lifecycle=ok
runtime-smoke-coverage=100%
grok-install-smoke=ok skills=21 key_skills_present
```

### Install path

Users should install from Grok's `/plugins` marketplace flow by adding this marketplace source:

```text
https://github.com/islee23520/lfg.git
```

Local development/preview only: developers can sync the plugin into `~/.grok/plugins/lfg` with:

```sh
plugins/lfg/bin/grok-install-smoke.sh
```
