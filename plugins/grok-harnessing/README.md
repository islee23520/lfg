# grok-build plugin

Grok plugin package for **OMX-like workflow/plugins for Grok Build**.

Inspired by [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex), this package adapts the workflow/plugin idea to Grok Build skills, hooks, MCP servers, and plugin data.

## Contents

- `.grok-plugin/plugin.json` — Grok manifest
- `.claude-plugin/plugin.json` — Claude Code compatibility manifest
- `skills/*/SKILL.md` — slash-invocable workflow skills
- `hooks/hooks.json` — hook registration
- `hooks/scripts/grok-build-audit-hook.sh` — fail-open audit hook
- `.mcp.json` + `bin/grok-build-mcp.py` — MCP server
- `bin/grok-build.py` — dependency-free MVP runtime
- `catalog/omx-skill-map.json` — oh-my-codex to Grok skill map

## Smoke test

```sh
bin/self-test.sh
```

## Runtime

```sh
bin/grok-build.py status
bin/grok-build.py catalog
bin/grok-build.py plan "ship grok-build MVP"
bin/grok-build.py ultraqa "verify plugin install"
```

Runtime state is stored under `~/.grok/plugin-data/grok-build/`.
