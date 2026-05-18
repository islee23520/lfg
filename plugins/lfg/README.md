# lfg plugin

Grok plugin package for **OMX-like workflow/plugins for LFG**.

Inspired by [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex), this package adapts the workflow/plugin idea to LFG skills, hooks, MCP servers, and plugin data.

## Contents

- `.grok-plugin/plugin.json` — Grok manifest
- `.claude-plugin/plugin.json` — Claude Code compatibility manifest
- `skills/*/SKILL.md` — slash-invocable workflow skills
- `hooks/hooks.json` — hook registration
- `hooks/scripts/lfg-audit-hook.sh` — fail-open audit hook
- `.mcp.json` + `bin/lfg-mcp.py` — MCP server
- `bin/lfg.py` — dependency-free MVP runtime
- `catalog/omx-skill-map.json` — oh-my-codex to Grok skill map

## Smoke test

```sh
bin/self-test.sh
```

## Runtime

```sh
bin/lfg.py status
bin/lfg.py catalog
bin/lfg.py plan "ship lfg MVP"
bin/lfg.py ultraqa "verify plugin install"
```

Runtime state is stored under `.lfg/`.
