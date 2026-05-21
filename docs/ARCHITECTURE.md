# Architecture & Goal — `islee23520/lfg`

## Goal

**Port the OMO agent hierarchy to Grok Build.**

`lfg` is the Grok Build implementation of an OMO-style agent operating system. The architecture centers on Grok-led orchestration, approved optional coding providers, Grok-discoverable OMO agent wrappers, passing T28 native child-spawn manual evidence, deterministic fallback envelopes for dependency-free smoke paths, durable `.lfg/` state, and explicit verification gates.

This document supersedes previous Codex-workflow-centered architecture notes.

## TypeScript Migration (M14)

**Active migration in progress.** The TypeScript runtime is now the active T11 verification surface, backed by Bun entrypoints and `omo-standalone` as a git submodule reference. See [docs/ts-cutover-adr.md](./ts-cutover-adr.md) for the frozen cutover contract.

During the migration, the TypeScript runtime is the replacement runtime and legacy compatibility/reference surfaces remain until the T12 removal task. The TS self-test (`bun plugins/lfg/bin/self-test.ts`) preserves the same `*=ok` evidence strings as the previous self-test. See the ADR for submodule location (`plugins/lfg/vendor/omo-standalone/`), runtime host strategy (Bun for dev, compiled JS for shipping), and compatibility surface policy (full preservation on first cut).

### TypeScript Runtime Surface

- CLI gateway: `plugins/lfg/bin/lfg` launches `bun plugins/lfg/bin/lfg.ts`.
- Runtime modules: `plugins/lfg/src/runtime-ts/` own the TypeScript command and service implementation.
- MCP server: `bun plugins/lfg/bin/lfg-mcp.ts` loads `plugins/lfg/src/mcp-ts/` while preserving legacy alias compatibility.
- Smoke runner: `bun plugins/lfg/bin/self-test.ts` loads `plugins/lfg/src/smoke-ts/` and emits the release evidence strings.
- Legacy runtime files remain present until T12 and should only be described as transitional or compatibility paths, not the primary runtime.

## Core Principles

- OMO agent hierarchy is the source of truth.
- First-class agents default to Grok model profiles except Hephaestus, which requires an approved GPT-style deep-specialist profile; approved optional execution providers remain `codex`, `copilot`, and `zai`, with `zai` implemented as a smoke-safe Z.ai/Zhipu HTTP adapter.
- Grok Build native sub-agent spawning is preferred where available; **xAI/Grok Oracle review is the mandatory product gate** (`oracleReview.required=true`) before any completion or Boulder advancement. Non-Grok reviewers are explicitly disallowed as replacement.
- Runtime state is durable, inspectable, and schema-versioned under `.lfg/`.
- Hooks and MCP surfaces are integration points, not hidden sources of truth.
- Grok plugin packaging should follow the documented Grok/Claude Code compatible discovery model: skills, plugins, hooks, MCPs, agents, marketplaces, and `AGENTS.md`/Claude instruction files are first-class compatibility surfaces.
- Real Grok/xAI API adapters should reference the official xAI API/SDK surface, but dependency-free smoke/runtime entrypoints must not hard-import provider SDKs.
- Verification evidence is part of the product contract.

---

## Current Runtime Implementation — How LFG Works with OMO

**As-built on the `feature/lfg-agent-orchestration-omo-parity` branch (May 2026).**

This section describes exactly how the code currently wires the OMO agent hierarchy into the LFG / Grok Build plugin. It is deliberately honest about the hybrid state during the parity migration.

### 1. The OMO Agent Registry (Source of Truth)

The canonical registry now includes first-class LFG OMO agents, support-agent metadata, and the `builtin-agents` policy layer:

- `plugins/lfg/src/agents/sisyphus.json` — main orchestrator
- `plugins/lfg/src/agents/hephaestus.json` — autonomous deep worker
- `plugins/lfg/src/agents/prometheus.json` — planning-only agent
- `plugins/lfg/src/agents/atlas.json` — checklist / dependency-wave executor
- `plugins/lfg/src/agents/oracle.json` — read-only plan compliance reviewer
- `plugins/lfg/src/agents/librarian.json` — documentation search specialist
- `plugins/lfg/src/agents/explore.json` — read-only codebase explorer
- `plugins/lfg/src/agents/multimodal-looker.json` — visual / multimodal inspector
- `plugins/lfg/src/agents/metis.json` — gap analyzer and pre-plan critic
- `plugins/lfg/src/agents/momus.json` — ruthless reviewer / validator
- `plugins/lfg/src/agents/sisyphus-junior.json` — bounded category executor
- `plugins/lfg/src/agents/builtin-agents.json` — policy / factory layer

**Loading code** (primary TS path: `plugins/lfg/src/runtime-ts/services/agent-registry.ts` and `plugins/lfg/src/runtime-ts/services/model-resolution.ts`; transitional compatibility path: `plugins/lfg/src/runtime-ts/index.ts` + `plugins/lfg/src/runtime-ts/constants.ts`):

- `CANONICAL_OMO_AGENT_IDS` — list of the canonical OMO agent IDs, defined in the TS runtime services and preserved in compatibility constants until T12.
- `OMO_TEAM_ELIGIBILITY_REGISTRY` — canonical team-member contract, defined in the TS runtime services and preserved in compatibility constants until T12.
- Agent registry loading reads the 12 JSON files from `plugins/lfg/src/agents/`.
- Registry indexes are exposed through the TypeScript CLI and MCP surfaces.
- `agents list` and `agents inspect` remain available via CLI and MCP.

**Current registry contract** (live example from `lfg --json agents list`):

Each entry contains: `id`, `name`, `family`, `role`, `mode`, `modelProfile`, `reasoningLevel`, `categories`, `tools`, `blockedTools`, `enabled`, `promptSource`, `teamEligibility`.

Loaded agents default to `provider: "xai"` + `model: "xai/grok-4.3"` except Hephaestus, whose deep-worker contract intentionally uses the approved GPT-style profile `openai/gpt-5.5`. `resolve_omo_model_profile()` also accepts approved execution providers (`codex`, `copilot`, `zai`; `zai` uses `ZAI_API_KEY`/`ZHIPU_API_KEY` only for explicit HTTP runs) and maps category → reasoning level while preserving Grok Oracle review as the completion gate.

**Legacy compatibility note**: the older custom names (`lina`, `gonow`, `iz`, `grok`) are historical only. They are **not** bundled in the current plugin and are not valid `team create` spec members.

See also: `plugins/lfg/src/agents/README.md` (the only doc that currently states the first-class vs legacy split correctly).

### 2. Category System & Model Resolution

`OMO_CATEGORY_MODEL_PROFILES` (3149) defines the mapping:

- `quick`, `unspecified-low` → medium reasoning
- `unspecified-high`, `planning` → high reasoning
- `deep`, `ultrabrain`, `artistry`, `visual-engineering`, `writing` → high (or specialized)

`resolve_omo_model_profile()` validates that the requested category is allowed for the agent and only accepts approved model providers (`xai`/`grok`, `codex`, `copilot`, `zai`). The `zai` provider points at the Coding Plan-compatible HTTP surface and stays dry-run by default.

### 3. The Grok Spawn Adapter (Current Behavior)

**Entry points**:
- CLI: `lfg spawn <agent_id> --category <c> --task "..."` (registered with comment "Grok Spawn Adapter (lfg-native OMO parity)")
- `spawn_cmd()` → `spawn_agent()`
- Also reachable via `grok_build_omo_agent_catalog` + future team specs

**What `spawn_agent` actually does today**:

1. Looks up the agent in `_OMO_REGISTRY_INDEX`.
2. Validates the category (if given).
3. Calls `resolve_omo_model_profile()` to get the approved execution model + reasoning.
4. Passes the request through the internal DAD-inspired supervision broker (`api: "internal-non-agent"`). The broker is not listed as an agent and is only reachable behind `spawn_agent`, `spawn_wave`, `TeamRuntime`/`team_create`, and dependency graph APIs. It records selected lane, model profile, evidence class, and policy reason; it rejects unsupported providers and uncontrolled recursive leases before execution.
5. **Returns a structured fallback envelope**:
   ```json
   {
     "ok": true,
     "schemaVersion": 1,
     "operation": "spawn",
     "mode": "fallback",
     "status": "completed",
     "agentId": "...",
     "modelProfile": { "provider": "codex", "model": "openai-codex", "reasoning": "..." },
     "children": [],
     "blockers": [],
     "touchedFiles": [],
      "evidenceClass": "dependency-free-smoke",
      "broker": {
        "api": "internal-non-agent",
        "selectedLane": "fallback-local",
        "modelProfile": { "provider": "xai", "model": "xai/grok-4.3", "reasoning": "low" },
        "evidenceClass": "dependency-free-smoke",
        "policyDecision": { "allowed": true, "policy": "omo-policy", "reason": "..." }
      },
      "evidence": [{ "summary": "dependency-free fallback spawn for ..." }],
     "runId": "run-...",
     "taskId": "task-...",
      "oracleReview": { "required": true, "provider": "xai", "role": "oracle", "strict": true },
      "recordPath": ".../.lfg/runs/spawns/<run-id>.json"
    }
    ```
6. Persists the record under `RUNS_DIR / "spawns"` for later inspection.

Dependency-free runtime calls still use deterministic fallback envelopes, while real Grok host child spawning is evidenced by the T28 manual gate in `docs/evidence/t28-grok-manual-gate-status.md`. `spawn_wave()`, `run_dependency_graph()`, `synthesize()`, and `resume()` now share the same canonical envelope contract.

This is the precise current state of Grok-led delegation for OMO agents: recorded host-native child-spawn evidence exists, and dependency-free runtime execution remains fallback-envelope based.

### 4. Entry Points & Surfaces (How You Reach the OMO Layer)

**Planning location contract**:
Plans created through LFG (`lfg plan create`, `grok_build_plan`, the `plan` skill, or via Prometheus) are written to the project's `.lfg/plans/` directory as both a structured `.json` and a readable `.md` file. This is the canonical durable home for plans inside the working project (nested under `.lfg/`).

**Direct OMO surfaces (new, parity-focused)**:
- `lfg --json agents list`
- `lfg --json agents inspect sisyphus --category deep`
- `lfg --json route --category quick --task "..."`
- `lfg --json spawn hephaestus --category ultrabrain --task "..."`
- `lfg --json plan create "..." --steps "..."`
- `lfg --json atlas start-work --plan-id <plan-id>`
- `lfg --json provider list`
- `lfg --json doctor state schema check`
- `lfg --json team create 3:executor "..."`
- MCP tools: canonical short names `omo_agent_catalog`, `omo_doctor`, `omo_team_create`, `omo_ulw` (legacy `grok_build_*` prefixes are dispatch aliases only)

**Observability**:
- `lfg doctor` — validates manifests, current skill/catalog contract, state schema, providers, hook bridge, etc.
- `lfg doctor state schema check` — focused JSON state-schema verifier for `.lfg/`
- `lfg setup` — syncs the plugin into `~/.grok/plugins/lfg` and records setup state.
- `lfg provider add` — stdlib interactive provider setup; persists env-var names only.
- `lfg status` — versions, active goals, catalog size, current goal/plan pointers
- `lfg hud` — compact dashboard of goals, plans, teams, wiki notes

**Higher-level orchestration (current transition state)**:
- `team_create()` and `ultragoal_spawn()` now prefer canonical OMO team specs (`"1:sisyphus,1:atlas,1:sisyphus-junior"` or `"3:executor"`) instead of the old custom lineup.
- Hyperplan and MCP OMO surfaces reference the first-class OMO catalog; legacy named agents are historical only and no longer valid team-spec members.
- `TeamRuntime` + `TeamStateStore` provide the durable mailbox + tasklist coordination (mode-aware separated directories under `.lfg/runs/<mode>-<id>/` to match real OmO behavior).

The "Sisyphus leads and spawns specialists via the Grok adapter" loop is **available today via explicit `spawn` + MCP** and is now the default `ulw` activation path through `defaultSpawnWave` / `defaultSpawnWavePlan`. `ultragoal`, `team create`, and `ralph` remain separate explicit transition surfaces until each is promoted into the same default OMO-native loop.

### 5. State & Persistence (OmO-like)

- Primary root: `$GROK_PLUGIN_DATA` (defaults to `$PWD/.lfg`).
- Wrappers (`bin/lfg`, `bin/ulw`) set `LFG_LAUNCHER` and `GROK_PLUGIN_DATA`.
- Separated run directories (in lfg.ts): `ultragoal/`, `ultrawork/`, `hyperplan/`, `runs/<mode>-<id>/teams/...` etc. — mirrors `~/.omo/state/team/<run-id>/` pattern.
- `TeamStateStore`, `TeamMailbox`, `TeamTasklist` classes provide the coordination primitives.
- Boulder / current-goal / current-plan / last-ultraqa pointers live at the top level for quick resumption.
- `doctor` and the state-schema verifier (`lfg --json doctor state schema check`) enforce the contract.

### 6. Current Hybrid State vs. Full Parity Target

- **What is wired and working**:
- Strict OMO agent registry with Grok defaults, a GPT-style Hephaestus deep-specialist gate, approved multi-provider overrides, mandatory Grok Oracle review envelopes, and team eligibility hard-rejects.
- Category-aware model resolution.
- `lfg agents` + `lfg spawn` + MCP catalog surfaces.
- Durable, mode-separated TeamRuntime + mailbox/tasklist.
- `ulw` activation persists Sisyphus-led discipline, creates a deterministic default spawn wave, and blocks prose-only completion without evidence; classic LFG surfaces (`ultragoal`, `ralph`, `team`, skills) continue to function as explicit transition paths.

**What is still transition-scoped**:
- Dependency-free runtime execution uses fallback envelopes; the real Grok host child-spawn proof remains manual evidence, not a dependency-free native call.
- `ultragoal`, `team create`, and `ralph` are explicit surfaces, not yet promoted into the default `ulw` closed loop.
- Full automatic closed-loop parity across every legacy command remains tracked in `docs/evidence/omo-feature-traceability.md` rather than claimed as complete.

See [ROADMAP.md](./ROADMAP.md) (M0–M13) and [docs/agent-system/omo-runtime-implementation-plan.md](./docs/agent-system/omo-runtime-implementation-plan.md) (the test-first slice plan) for the remaining work.

---

## High-Level Architecture (Vision)

The long-term target (once the manual gate is replaced by real Grok spawning) is exactly the diagram that used to be the entire document:

```
Grok Build
  └─ islee23520/lfg plugin
      ├─ Agent Registry (the 6 OMO agents above)
      ├─ Grok Spawn Adapter (real calls replacing the fallback)
      ├─ Runtime State (.lfg/ with separated runs)
      ├─ Surfaces (skills, hooks, bin/lfg.ts, lfg-mcp.ts, lfg/ulw)
      └─ Verification (self-test.ts, Bun smoke matrix, release scripts)
```

Until then, the "Current Runtime Implementation" section above is the accurate map.

For a prompt-by-prompt visual walkthrough of the official xAI Responses API layer versus LFG's project-specific OMO orchestration layer, see [GROK-BUILD-PROMPT-STAGES.md](GROK-BUILD-PROMPT-STAGES.md).

## Team Mode, Hyperplan, Boulder

**Team Mode is active** (`team_mode.enabled=true`). `team_*` tools (`team_create`, `team_task_create`, `team_send_message`, `team_status` 등)는 현재 세션에서 공식적인 멀티에이전트 오케스트레이션 인터페이스입니다.

`TeamRuntime`, `TeamStateStore`, `TeamMailbox`, `TeamTasklist`은 `.lfg/runs/<mode>-<id>/` 아래에 모드별로 분리된 durable 상태를 제공하며, Sisyphus가 OMO-named agent(Sisyphus-Junior, Prometheus, Hephaestus, Atlas 등)를 `spawn_agent()`를 통해 위임할 때의 실행 substrate입니다.

기존 `ulw` / `team` / `ralph` 흐름은 이미 이 레이어를 사용하고 있으며, OMO registry의 agent들이 기본 스폰 대상이 되면 `team_create` → `team_task_create` + `team_send_message`가 표준 delegation 경로가 됩니다.

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
bun plugins/lfg/bin/self-test.ts          # emits dozens of *=ok strings
bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils
```

**Release gates**:
```sh
bun plugins/lfg/bin/self-test.ts
bun plugins/lfg/bin/self-test.ts plus marketplace remote smoke
```

**Inside Grok**:
- `grok_build_omo_doctor`
- `grok_build_omo_agent_catalog`
- `grok_build_omo_team_create` (with hyperplan)
- The `/lfg` skill for surface stress-testing

All of these are exercised by `self-test.ts` and the release-readiness scripts. Exact evidence strings are product contracts (see [docs/SMOKE.md](./docs/SMOKE.md) and [docs/TEST_RULES.md](./docs/TEST_RULES.md)).

## Non-Goals (Unchanged)

- Do not preserve legacy workflow identity as the product north star.
- Do not introduce heavy non-Grok runtimes.
- Do not hide behavior in undocumented hooks.
- Do not depend on real provider credentials in dependency-free smoke tests.

## Success Criteria

`lfg` succeeds when:

1. All six OMO agent families are present as Grok-model agents (done — registry + JSONs).
2. Grok native spawning is the primary delegation path (in progress — adapter exists, real call still gated).
3. Boulder, Team Mode, Hyperplan, Prometheus + Atlas + Hephaestus + Sisyphus discipline are the default execution model (Team Mode active).
4. `.lfg/` state is durable, validated, and resumable (largely done).
5. CLI, slash, MCP, skills, hooks, docs, tests, and release gates describe one coherent OMO-for-Grok product.

---

**Last verified against**: current state of `plugins/lfg/src/runtime-ts/` + `plugins/lfg/src/mcp-ts/` + `plugins/lfg/src/agents/*.json` on the omo-parity branch (May 2026).

This document is intended to be updated as each implementation slice lands. When the manual gate is removed and the default orchestration paths are rewired to the OMO registry, the "Current Implementation" section will be rewritten to reflect the new reality.
