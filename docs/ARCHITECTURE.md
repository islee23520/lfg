# Architecture & Goal — `linalab-io/lfg`

## Goal

**Port the OMO agent hierarchy to Grok Build.**

`lfg` is the Grok Build implementation of an OMO-style agent operating system. The architecture centers on Grok-model agents, Grok-native sub-agent spawning, durable `.lfg/` state, and explicit verification gates.

This document supersedes previous Codex-workflow-centered architecture notes.

## Core Principles

- OMO agent hierarchy is the source of truth.
- Every first-class agent resolves to a Grok model.
- Grok Build native sub-agent spawning is the primary delegation mechanism.
- Runtime state is durable, inspectable, and schema-versioned under `.lfg/`.
- Hooks and MCP surfaces are integration points, not hidden sources of truth.
- Verification evidence is part of the product contract.

---

## Current Runtime Implementation — How LFG Works with OMO

**As-built on the `feature/lfg-agent-orchestration-omo-parity` branch (May 2026).**

This section describes exactly how the code currently wires the OMO agent hierarchy into the LFG / Grok Build plugin. It is deliberately honest about the hybrid state during the parity migration.

### 1. The OMO Agent Registry (Source of Truth)

The six first-class OMO agents are defined as JSON files and loaded at runtime:

- `plugins/lfg/src/agents/sisyphus.json` — main orchestrator
- `plugins/lfg/src/agents/sisyphus-junior.json` — bounded category executor
- `plugins/lfg/src/agents/prometheus.json` — planning-only agent
- `plugins/lfg/src/agents/hephaestus.json` — autonomous deep worker
- `plugins/lfg/src/agents/atlas.json` — checklist / dependency-wave executor
- `plugins/lfg/src/agents/builtin-agents.json` — policy / factory layer

**Loading code** (all in [plugins/lfg/bin/lfg.py](/Users/ilseoblee/workspace/linalab/lfg/plugins/lfg/bin/lfg.py)):

- `CANONICAL_OMO_AGENT_IDS` (3123)
- `load_omo_agent_registry()` (3133) — reads the six JSON files from `src/agents/`
- `OMO_AGENT_REGISTRY` and `_OMO_REGISTRY_INDEX` (3146–3147) — the live in-memory registry
- `agents_list()` (3196) and `agents_inspect()` (3206) — exposed via CLI and MCP

**Current registry contract** (live example from `lfg --json agents list`):

Each entry contains: `id`, `name`, `family`, `role`, `mode`, `modelProfile`, `reasoningLevel`, `categories`, `tools`, `blockedTools`, `enabled`, `promptSource`.

All six agents hard-require `provider: "xai"` + `model: "xai/grok-4.3"`. `resolve_omo_model_profile()` (3166) enforces this and maps category → reasoning level.

**Legacy compatibility layer**: `plugins/lfg/src/agents/legacy/` still contains the older `lina-orchestrator.json`, `gonow-worker.json`, `iz-architect.json`, `grok-consultant.json`. These are used only by existing `team create` specs that have not yet been migrated. They are **not** part of the canonical OMO registry.

See also: `plugins/lfg/src/agents/README.md` (the only doc that currently states the first-class vs legacy split correctly).

### 2. Category System & Model Resolution

`OMO_CATEGORY_MODEL_PROFILES` (3149) defines the mapping:

- `quick`, `unspecified-low` → medium reasoning
- `unspecified-high`, `planning` → high reasoning
- `deep`, `ultrabrain`, `artistry`, `visual-engineering`, `writing` → high (or specialized)

`resolve_omo_model_profile()` validates that the requested category is allowed for the agent and always forces the provider to `xai/grok-4.3`.

### 3. The Grok Spawn Adapter (Current Behavior)

**Entry points**:
- CLI: `lfg spawn <agent_id> --category <c> --task "..."` (registered at 3658 with comment "Grok Spawn Adapter (lfg-native OMO parity)")
- `spawn_cmd()` (3231) → `spawn_agent()` (2573)
- Also reachable via `grok_build_omo_agent_catalog` + future team specs

**What `spawn_agent` actually does today** (lines 2573–2636):

1. Looks up the agent in `_OMO_REGISTRY_INDEX`.
2. Validates the category (if given).
3. Calls `resolve_omo_model_profile()` to get the exact Grok model + reasoning.
4. **Returns a structured fallback envelope**:
   ```json
   {
     "ok": true,
     "status": "fallback_manual_gate",
     "agent_id": "...",
     "model_profile": { "provider": "xai", "model": "xai/grok-4.3", "reasoning": "..." },
     "evidence": "manual-gated fallback spawn for ...",
     "manual_gate_required": true,
     "record_path": ".../.lfg/runs/spawns/<uuid>.json"
   }
   ```
5. Persists the record under `RUNS_DIR / "spawns"` for later inspection.

**There is no actual Grok sub-agent spawn call yet.** The real native spawning primitive is still behind the manual gate documented in `docs/evidence/grok-subagent-spawning.md`. `spawn_wave()` (2639) and `run_dependency_graph()` exist as structural skeletons that call the same adapter.

This is the precise current state of "Grok-native delegation for OMO agents."

### 4. Entry Points & Surfaces (How You Reach the OMO Layer)

**Planning location contract**:
Plans created through LFG (`lfg plan create`, `grok_build_plan`, the `plan` skill, or via Prometheus) are written to the project's `.lfg/plans/` directory as both a structured `.json` and a readable `.md` file. This is the canonical durable home for plans inside the working project (nested under `.lfg/`).

**Direct OMO surfaces (new, parity-focused)**:
- `lfg agents list` / `lfg --json agents list`
- `lfg agents inspect sisyphus --category deep`
- `lfg spawn hephaestus --category ultrabrain --task "..."` 
- MCP tools: `grok_build_omo_agent_catalog`, `grok_build_omo_doctor`, `grok_build_omo_team_create`, `grok_build_omo_ulw`

**Observability**:
- `lfg doctor` (3383) — validates manifests, skill count (≥28), state schema, providers, hook bridge, etc.
- `lfg status` (1766) — versions, active goals, catalog size, current goal/plan pointers
- `lfg hud` (1729) — compact dashboard of goals, plans, teams, wiki notes

**Higher-level orchestration (still largely legacy/hybrid)**:
- `team_create()` (2847), `ultragoal_spawn()` (489), `ralph_*`, most skills, and `worker` commands primarily use legacy specs (`"1:iz,1:gonow,1:grok"`) + external CLIs or generic prompts.
- Hyperplan and certain MCP paths are starting to reference the new OMO catalog.
- `TeamRuntime` (2372) + `TeamStateStore` provide the durable mailbox + tasklist coordination (mode-aware separated directories under `.lfg/runs/<mode>-<id>/` to match real OmO behavior).

The "Sisyphus leads and spawns the other five via the Grok adapter" loop is **available today via explicit `spawn` + MCP**, but is not yet the default execution path for `ultragoal`, `team create`, or `ralph`.

### 5. State & Persistence (OmO-like)

- Primary root: `$GROK_PLUGIN_DATA` (defaults to `./.lfg` or `~/.grok/lfg` data tree).
- Wrappers (`bin/lfg`, `bin/ulw`) set `LFG_LAUNCHER` and `GROK_PLUGIN_DATA`.
- Separated run directories (Phase 1+ in lfg.py ~2089): `ultragoal/`, `ultrawork/`, `hyperplan/`, `runs/<mode>-<id>/teams/...` etc. — mirrors `~/.omo/state/team/<run-id>/` pattern.
- `TeamStateStore`, `TeamMailbox`, `TeamTasklist` classes provide the coordination primitives.
- Boulder / current-goal / current-plan / last-ultraqa pointers live at the top level for quick resumption.
- `doctor` and the state-schema verifier (`scripts/verify-state-schema.sh`) enforce the contract.

### 6. Current Hybrid State vs. Full Parity Target

**What is wired and working**:
- Strict OMO agent registry with Grok-only profiles.
- Category-aware model resolution.
- `lfg agents` + `lfg spawn` + MCP catalog surfaces.
- Durable, mode-separated TeamRuntime + mailbox/tasklist.
- All the classic LFG/ULW surfaces (`ultragoal`, `ralph`, `team`, skills) continue to function.

**What is still behind the gate or legacy**:
- Actual Grok native `spawn_subagent` call for OMO-named agents (manual gate).
- Default orchestration for most user commands still uses the old named-agent + CLI/provider model.
- Full "Sisyphus owns the boulder and delegates via spawn waves" closed loop is not yet the automatic path.

See [ROADMAP.md](/Users/ilseoblee/workspace/linalab/lfg/ROADMAP.md) (M0–M13) and [docs/agent-system/omo-runtime-implementation-plan.md](/Users/ilseoblee/workspace/linalab/lfg/docs/agent-system/omo-runtime-implementation-plan.md) (the test-first slice plan) for the remaining work.

---

## High-Level Architecture (Vision)

The long-term target (once the manual gate is replaced by real Grok spawning) is exactly the diagram that used to be the entire document:

```
Grok Build
  └─ linalab-io/lfg plugin
      ├─ Agent Registry (the 6 OMO agents above)
      ├─ Grok Spawn Adapter (real calls replacing the fallback)
      ├─ Runtime State (.lfg/ with separated runs)
      ├─ Surfaces (skills, hooks, bin/lfg.py, lfg-mcp.py, lfg/ulw)
      └─ Verification (self-test.sh, smoke matrix, release scripts)
```

Until then, the "Current Runtime Implementation" section above is the accurate map.

## Team Mode, Hyperplan, Boulder

These concepts are already implemented at the coordination layer (`TeamRuntime`, mailbox, tasklist, ultrawork loops) and are used by the existing `ulw` / `team` / `ralph` flows. They will be the execution substrate once the OMO-named agents become the default spawnees.

## Verification Architecture (How to Check That It Works)

See the user's earlier questions. The canonical commands are:

**Fast local checks**:
```sh
lfg doctor
lfg --json doctor
lfg agents list
lfg agents inspect sisyphus
lfg spawn sisyphus-junior --category quick --task "smoke"
```

**Plugin integrity**:
```sh
plugins/lfg/bin/self-test.sh          # emits dozens of *=ok strings
python3 -m unittest tests.smoke.test_grok_build_runtime -v
```

**Release gates**:
```sh
scripts/verify-release-readiness-local.sh
scripts/verify-release-readiness-all.sh
```

**Inside Grok**:
- `grok_build_omo_doctor`
- `grok_build_omo_agent_catalog`
- `grok_build_omo_team_create` (with hyperplan)
- The `/lfg` skill for surface stress-testing

All of these are exercised by `self-test.sh` and the release-readiness scripts. Exact evidence strings are product contracts (see [docs/SMOKE.md](/Users/ilseoblee/workspace/linalab/lfg/docs/SMOKE.md) and [docs/TEST_RULES.md](/Users/ilseoblee/workspace/linalab/lfg/docs/TEST_RULES.md)).

## Non-Goals (Unchanged)

- Do not preserve legacy workflow identity as the product north star.
- Do not introduce heavy non-Grok runtimes.
- Do not hide behavior in undocumented hooks.
- Do not depend on real provider credentials in dependency-free smoke tests.

## Success Criteria

`lfg` succeeds when:

1. All six OMO agent families are present as Grok-model agents (done — registry + JSONs).
2. Grok native spawning is the primary delegation path (in progress — adapter exists, real call still gated).
3. Boulder, Team Mode, Hyperplan, Prometheus + Atlas + Hephaestus + Sisyphus discipline are the default execution model (hybrid today).
4. `.lfg/` state is durable, validated, and resumable (largely done).
5. CLI, slash, MCP, skills, hooks, docs, tests, and release gates describe one coherent OMO-for-Grok product.

---

**Last verified against**: current state of `plugins/lfg/bin/lfg.py` + `src/agents/*.json` on the omo-parity branch (May 2026).

This document is intended to be updated as each implementation slice lands. When the manual gate is removed and the default orchestration paths are rewired to the OMO registry, the "Current Implementation" section will be rewritten to reflect the new reality.