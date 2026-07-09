# src/core

## OVERVIEW

Host-neutral behavior and contracts. No Grok filesystem ownership, no CLI emit, no install side effects.

## STRUCTURE

```
core/
├── omo/           # upstream-derived OMO cores (Phase 0–6 ports)
│   ├── model-core/
│   ├── rules-engine/
│   ├── prompts-core/
│   ├── agent-builder/
│   ├── delegate-core/
│   ├── boulder-state/
│   └── skills-loader-core/
├── lfg/           # lfg-owned neutral helpers (e.g. subagent spawn map)
├── adapter/       # HostAdapterCapabilities types
└── core-boundary.test.ts
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Model resolve / fallback | `omo/model-core/` | Family detectors need Grok adapter `availableModels` mapping. |
| Rules / AGENTS walk | `omo/rules-engine/` | Grok glue: `src/grok/ports/rules-injector.ts`. |
| Prompt variants | `omo/prompts-core/` | Bundled md under `prompts/*`. |
| Agent builder registry | `omo/agent-builder/` | Full Sisyphus/Hephaestus builders remain host-bound/Deferred. |
| Delegation / retry | `omo/delegate-core/` | Consumed via `grok/ports/grok-delegate-adapter.ts`. |
| Boulder / plan state | `omo/boulder-state/` | `.omo` plan checklist storage. |
| Skills loader core | `omo/skills-loader-core/` | Host-neutral slice only; OpenCode discovery Deferred. |
| Host capability types | `adapter/host-capabilities.ts` | Filled by `src/grok/adapter/`. |
| Spawn type map | `lfg/subagents/omo-spawn-map.ts` | OMO spawn → lfg subagent names. |

## CONVENTIONS

- Import ban enforced by `core-boundary.test.ts`: no `src/grok`, `src/cli`, `dist`, `components`, root `skills`, grok assets/fixture/flavour.
- Prefer pure functions + explicit inputs (`availableModels`, paths) over process env / Grok home.
- Grok-specific behavior belongs in `src/grok/ports/*` or install glue, not here.
- `ports/vendor/*-vendored` re-exports are **not** behavioral owners.

## ANTI-PATTERNS

- Importing install, hooks, MCP, or skill payload trees.
- Claiming full agent parity by expanding registry stubs without a real Grok surface.
- Putting OpenCode-only host APIs into `skills-loader-core` without marking Deferred.
- Writing to `~/.grok` or reading production home from core modules.
