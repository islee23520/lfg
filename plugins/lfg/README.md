# lfg plugin

Grok plugin package for **OMO agent hierarchy parity for Grok Build**.

This package is the marketplace plugin surface for porting oh-my-openagent-style agent orchestration into LFG/Grok: Grok-discoverable OMO agent wrappers, runtime policy agents, passing T28 native child-spawn manual evidence, deterministic fallback envelopes for dependency-free smoke paths, durable `.lfg` state, skills, hooks, MCP servers, and plugin data. See `docs/evidence/omo-feature-traceability.md` and `docs/evidence/t28-grok-manual-gate-status.md` for the current wired/manual-gated-ok/transition status.

## Contents

- `.grok-plugin/plugin.json` — Grok manifest
- `.claude-plugin/plugin.json` — Claude Code compatibility manifest
- `agents/*.md` — Grok-discoverable OMO agent wrappers
- `skills/*/SKILL.md` — slash-invocable surfaces migrating to OMO semantics
- `hooks/hooks.json` — hook registration
- `hooks/scripts/lfg-audit-hook.sh` — fail-open audit hook
- `.mcp.json` + `bin/lfg-mcp.ts` — MCP server
- `bin/lfg.ts` — gateway to the dependency-free runtime and future Grok spawn adapter
- `src/agents/harness.toml` — agent harness metadata (canonical)
- `src/agents/*.json` — runtime policy/registry definitions (canonical)

## Smoke test

```sh
bun bin/self-test.ts
```

## Runtime

```sh
bun bin/lfg.ts agents list
bun bin/lfg.ts route --category quick --task "..."
bun bin/lfg.ts spawn sisyphus-junior --category quick --task "..."
bun bin/lfg.ts plan create "..." --steps "..."
bun bin/lfg.ts atlas start-work --plan-id <plan-id>
bun bin/lfg.ts provider list
bun bin/lfg.ts doctor
bun bin/lfg.ts doctor state schema check
bun bin/lfg.ts team preflight
```

Runtime state is stored under `.lfg/`.
