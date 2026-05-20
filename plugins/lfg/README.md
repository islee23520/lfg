# lfg plugin

Grok plugin package for **OMO agent hierarchy parity for Grok Build**.

This package is the marketplace plugin surface for porting oh-my-openagent-style agent orchestration into LFG/Grok: Grok-model agents, Grok-native sub-agent spawning, durable `.lfg/` state, skills, hooks, MCP servers, and plugin data.

## Contents

- `.grok-plugin/plugin.json` — Grok manifest
- `.claude-plugin/plugin.json` — Claude Code compatibility manifest
- `skills/*/SKILL.md` — slash-invocable surfaces migrating to OMO semantics
- `hooks/hooks.json` — hook registration
- `hooks/scripts/lfg-audit-hook.sh` — fail-open audit hook
- `.mcp.json` + `bin/lfg-mcp.py` — MCP server
- `bin/lfg.py` — gateway to the dependency-free runtime and future Grok spawn adapter
- `src/agents/harness.toml` — agent harness metadata (canonical)
- `src/agents/*.json` — named team agent definitions (canonical)

## Smoke test

```sh
bin/self-test.py
```

## Runtime

```sh
bin/lfg.py agents list
bin/lfg.py route --category quick --task "..."
bin/lfg.py spawn sisyphus-junior --category quick --task "..."
bin/lfg.py plan create "..." --steps "..."
bin/lfg.py atlas start-work --plan-id <plan-id>
bin/lfg.py provider list
bin/lfg.py doctor
bin/lfg.py doctor state schema check
bin/lfg.py team preflight
```

Runtime state is stored under `.lfg/`.
