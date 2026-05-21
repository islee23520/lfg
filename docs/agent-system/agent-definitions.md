# A. Agent Definition System (Named Purpose-Specific Agents)

> **Historical / Design note (2026-05)**: This document captured the original proposal for custom LFG agents (`lina`, `gonow`, `iz`, `grok`).
> The current canonical first-class implementation is the OMO hierarchy (`sisyphus` + family) living in `plugins/lfg/src/agents/*.json`, loaded via `load_omo_agent_registry()` in `plugins/lfg/src/runtime-ts/index.ts`.
> See the "Current Runtime Implementation" section of [docs/ARCHITECTURE.md](/docs/ARCHITECTURE.md) and `plugins/lfg/src/agents/README.md` for the live state.
> Legacy definitions are historical reference only; current team specs must use canonical OMO agents or generic category roles.

## Goal (Original Design)
Allow users to define, register, and reuse **named agents** with clear identity, role, and behavior — similar to OmO's subagent_type + category system, but tailored to LFG + ULW.

## Core Requirements
- Agents have a **name** (lina, gonow, iz, grok, etc.)
- Every agent runs with **ULW identity** (LFG_LAUNCHER=ulw)
- Agents can be used in `lfg team create`, `lfg ultragoal spawn`, and team templates
- Support both external CLIs and native Grok `spawn_subagent`
- Easy to extend with new named agents

## Proposed Agent Definition Format (JSON)

Location: `~/.grok/lfg/agents/<name>.json`; this section is historical proposal material, not the current bundled runtime layout.

Example: `iz-architect.json`

```json
{
  "name": "iz",
  "display_name": "IZ - Architect",
  "role": "architect",
  "identity": "ulw",
  "default_category": "deep",
  "subagent_type": "plan",
  "description": "Deep structural thinker responsible for architecture, long-term trade-offs, and system boundaries.",
  "prompt_overrides": {
    "base": "You are IZ, an elite software architect operating as an ULW worker...",
    "deep": "You operate in maximum reasoning depth mode..."
  },
  "tool_preferences": ["ast_grep", "lsp", "code_review", "ultragoal_checkpoint"],
  "reasoning_style": "systematic, risk-aware, long-term"
}
```

Similar files:
- `lina-orchestrator.json`
- `gonow-worker.json`
- `grok-consultant.json`

## How It Integrates with Existing Code

1. `resolve_providers_for_role()` will be extended to `resolve_providers_for_agent(name)`
2. `build_worker_prompt()` will accept agent definition and merge role + category + identity
3. Historical note: older drafts used `lfg team create iz,gonow,grok "..."`, but current runtime team specs must use canonical OMO agents such as `sisyphus,atlas,sisyphus-junior` or generic roles like `3:executor`
4. For `grok` provider + named agent → calls `spawn_subagent` with the agent's specific prompt + `subagent_type`

## Benefits over Current Role-Only System
- Reusability across projects and teams
- Clear personality and expectations per agent
- Easier to implement Hyperplan-style required agent sets
- Better prompt engineering and tool restriction per named agent

## Implementation Status (M13 Lock)

The named agent system is fully implemented using the OMO hierarchy:
- [x] Define schema + loader (done — `load_omo_agent_registry()`).
- [x] CLI commands: `lfg agents list`, `lfg agents inspect sisyphus` (done).
- [x] Integration into team_create / ultragoal_spawn (done — `TeamRuntime` + OMO registry).

This forms the foundation for B and C.
