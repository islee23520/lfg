# Roadmap — `LFG: OMO Agent Hierarchy Parity for Grok Build` 

## North Star

Build **full OMO agent hierarchy parity for Grok Build**.

`lfg` is no longer a Codex-workflow adaptation. The product target is to port the core [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) agent hierarchy and orchestration model into **Grok Build**, using Grok as the orchestrator/reviewer, approved optional coding providers for execution lanes, and Grok-native sub-agent spawning where available.

Core constraints:

- First-class agents default to Grok model profiles except Hephaestus, which requires an approved GPT-style deep-specialist profile; approved optional providers (`codex`, `copilot`, `zai`) may execute bounded lanes; Z.ai/Zhipu runs through an optional HTTP adapter.
- Grok Oracle review is mandatory before completion or Boulder advancement; Grok Build native sub-agent spawning remains the preferred execution mechanism where supported.
- Legacy Codex-derived workflow logic is being removed, renamed, or migrated.
- OMO's agent hierarchy is the behavioral source of truth: Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, and builtin-agents.
- The implementation remains Grok marketplace-first, dependency-light, and verifiable through deterministic smoke gates.

## Product Goal

A user should install `lfg` from Grok `/plugins` and get an OMO-style agent operating system inside Grok Build:

- Sisyphus orchestrates the work.
- Prometheus plans before execution.
- Atlas drives checklist and dependency-wave execution.
- Hephaestus performs autonomous deep work.
- Sisyphus-Junior executes focused category-routed tasks.
- builtin-agents resolve model, category, skill, permission, and override policy.
- Team Mode, Hyperplan, Boulder, mailbox, continuation, and quality gates are durable under `.lfg/`.

## Installation Model

Primary install flow remains Grok-native marketplace installation:

1. User opens LFG / Grok Build.
2. User opens `/plugins`.
3. User adds the LinaLab marketplace source.
4. User installs `lfg`.
5. Grok discovers agent definitions, skills, hooks, MCP server, and runtime helpers.

Package identity:

```text
Marketplace: islee23520
Package:     islee23520/lfg
Plugin id:   lfg
Repo:        https://github.com/islee23520/lfg
Reference:   oh-my-openagent agent hierarchy and orchestration model
```

Local copy/symlink install is development-only. Marketplace install is the product path.

## Target Architecture

```text
LFG / Grok Build
  └─ Marketplace install: islee23520/lfg
      └─ lfg plugin
          ├─ agents/
          │   ├─ sisyphus/              # main orchestrator
          │   ├─ sisyphus-junior/       # category-spawned focused executor
          │   ├─ prometheus/            # interview-mode strategic planner
          │   ├─ hephaestus/            # autonomous deep worker
          │   ├─ atlas/                 # todo-list orchestrator
          │   └─ builtin-agents/        # model/category/skill/override factory layer
          ├─ skills/*/SKILL.md          # Grok slash entrypoints backed by OMO semantics
          ├─ hooks/hooks.json           # fail-open hooks and bridge surfaces
          ├─ .mcp.json                  # MCP registration
          ├─ bin/lfg-mcp.py             # stdio MCP server with agent/runtime/team tools
          ├─ bin/lfg.py                 # dependency-light runtime and Grok spawn adapter
          ├─ bin/lfg + bin/ulw          # default runtime wrappers
          └─ .lfg/                      # Boulder, mailbox, teams, plans, notepads, run state
```

## Feature Scope

### Agent Hierarchy

- `Sisyphus`: primary orchestrator, persistence, delegation, quality discipline, completion enforcement.
- `Sisyphus-Junior`: focused executor spawned by category routing; executes directly and verifies.
- `Prometheus`: interview-mode planner; produces verifiable plans before work starts.
- `Hephaestus`: autonomous deep worker; goal-oriented, not recipe-oriented.
- `Atlas`: checklist orchestrator; runs dependency waves until every checkbox is complete.
- `builtin-agents`: factory layer for model resolution, skill filtering, overrides, and policy gates.

### OMO Runtime Patterns

- Grok-native sub-agent spawning adapter plus approved multi-provider execution lanes.
- Category routing: `quick`, `deep`, `ultrabrain`, `artistry`, `visual-engineering`, `writing`, `unspecified-low`, `unspecified-high`.
- Boulder state: current goal, evidence, blockers, continuation notes, recent attempts.
- Mailbox and shared tasklist for team execution.
- Hyperplan: hostile critics plus lead synthesis.
- Ultrawork: persistent autonomous execution until acceptance criteria pass.
- Prometheus plus Atlas: plan first, then execute every dependency wave.
- Quality gates: critic review, evidence strings, tests, manual verification.

## Milestones

### M0 — Contract Freeze and Audit

- [x] Inventory every legacy Codex-derived reference in docs, skills, tests, metadata, scripts, runtime state, and release evidence.
- [x] Inventory current OMO groundwork under `docs/agent-system/`, `plugins/lfg/src/agents/`, and `plugins/lfg/bin/lfg.py`.
- [x] Decide which legacy commands are deleted, renamed, or temporarily migrated.
- [x] Produce an evidence-backed removal map before implementation.

### M1 — Grok Sub-Agent Spawning Verification

- [x] Confirm official xAI/Grok Build support for native sub-agent spawning.
- [x] Document the equivalent of OMO `task()` and `call_omo_agent` in Grok terms.
- [x] Define fallback behavior if native spawning is unavailable in a local environment.
- [x] Add a focused manual gate for real Grok spawning evidence.

### M2 — OMO-First Documentation Rewrite

- [x] Rewrite `ROADMAP.md` around OMO parity.
- [x] Rewrite `README.md` around Grok Build plus OMO agent hierarchy.
- [x] Rewrite `docs/ARCHITECTURE.md` around OMO agents, Grok spawn adapter, Boulder, and Team Mode.
- [x] Rewrite `docs/AGENTS.md` and root `AGENTS.md` to guide future work.

### M3 — Agent Registry Contracts

- [x] Add tests for the six required agent families.
- [x] Add tests that every agent resolves to a Grok model.
- [x] Add tests for category-to-agent routing.
- [x] Add tests for disabled-agent and override policy.

### M4 — Grok-Only OMO Agent Registry

- [x] Implement canonical registry entries for Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, and builtin-agents.
- [x] Encode model, reasoning level, tool access, blocked tools, and prompt source for each agent.
- [x] Expose registry through CLI and MCP.

### M5 — Grok Spawn Adapter

- [x] Implement a runtime adapter that spawns Grok sub-agents from registry entries.
- [x] Support parallel and sequential execution modes.
- [x] Support dependency-aware fan-out and lead synthesis.
- [x] Preserve deterministic no-network smoke behavior through a local fallback.

### M6 — Category Routing and Sisyphus-Junior

- [x] Port OMO category routing.
- [x] Ensure category tasks spawn Sisyphus-Junior with the correct Grok model profile.
- [x] Enforce no recursive uncontrolled delegation.
- [x] Add verification gates for category decisions.

### M7 — Boulder, Continuation, Mailbox, Tasklist

- [x] Port Boulder schema under `.lfg/boulder/`.
- [x] Port notepad and accumulated-wisdom files under `.lfg/notepads/`.
- [x] Port mailbox and shared tasklist structures under `.lfg/teams/`.
- [x] Add schema versioning and `doctor` validation.

### M8 — Team Mode

- [x] Port member kinds, eligibility, mailbox delivery, task lifecycle, and shutdown protocol.
- [x] Keep tmux-backed execution for local observability.
- [x] Add Grok sub-agent team spawning where supported.
- [x] Preserve smoke-safe provider behavior.

### M9 — Hyperplan

- [x] Port adversarial planning with hostile critics and lead synthesis.
- [x] Add task graph creation, critique rounds, revision rounds, and final plan artifact.
- [x] Store Hyperplan artifacts under `.lfg/hyperplan/`.
- [x] Add smoke coverage for plan completeness and critique evidence.

### M10 — Prometheus and Atlas

- [x] Port Prometheus interview-mode planning into `.lfg/plans/`.
- [x] Port Atlas checkbox execution and dependency waves.
- [x] Enforce plan read-back, checkbox update, and next-wave dispatch.
- [x] Add tests for incomplete checkbox prevention.

### M11 — Hephaestus and Ultrawork

- [x] Port Hephaestus as the autonomous deep worker.
- [x] Port Ultrawork execution loops with explicit stop conditions.
- [x] Require evidence before Boulder advancement.
- [x] Add completion detection and blocker escalation.

### M12 — Runtime, MCP, Skills, and Hooks Rewrite

- [x] Replace command semantics with OMO agent semantics.
- [x] Expose agent registry, spawn, team, Boulder, and Hyperplan through MCP.
- [x] Update slash skills to call the OMO runtime paths.
- [x] Update hooks to inject OMO execution discipline and recovery context.

### M13 — Release QA and Documentation Lock

- [ ] Run dependency-free smoke tests.
- [ ] Run repo-native integration checks.
- [ ] Run real Grok manual gates where available.
- [ ] Update release checklist and smoke docs with exact evidence strings.
- [ ] Perform post-implementation review before release.


## Parallel Execution Graph

```text
Wave 1: M0 audit + M1 Grok spawning verification
Wave 2: M2 docs rewrite + M3 test contracts
Wave 3: M4 registry + M5 spawn adapter + M6 categories
Wave 4: M7 state + M8 team mode + M9 hyperplan
Wave 5: M10 Prometheus/Atlas + M11 Hephaestus/Ultrawork
Wave 6: M12 runtime surface + M13 release QA
```


## Preserved Release Evidence Contracts

These evidence strings are retained during the OMO parity migration because scripts and smoke tests treat them as product contracts. They do not define the new north star; they define the currently verified marketplace/runtime baseline that the OMO port must preserve or explicitly migrate.

- [x] Publish/host marketplace metadata so users can add it from Grok `/plugins`.
- [x] Document exact marketplace source URL.
- [x] Verify install from Grok UI/TUI marketplace flow.
- [x] Remove local-dev install from primary docs once marketplace flow is stable.
- [x] Add behavioral smoke tests per workflow.
- [x] MCP stderr isolation.
- [x] State migration/versioning.
- [x] Release tags.
- [x] Marketplace release notes.

Required evidence strings currently asserted by smoke/release gates:

- [x] manifest-and-file-checks=ok
- [x] marketplace-metadata=ok
- [x] release-notes=ok
- [x] marketplace-source=ok
- [x] hook-smoke=ok
- [x] todo-continuation=ok
- [x] ruff-check=ok
- [x] mcp-smoke=ok
- [x] mcp-stdio-isolation=ok
- [x] mcp-stderr-isolated=ok
- [x] state-schema-versioning=ok
- [x] state-schema-doctor=ok
- [x] team-dry-run=ok
- [x] models-auth=ok
- [x] team-tmux-lifecycle=ok
- [x] runtime-smoke-coverage=100%
- [x] grok-install-smoke=ok skills=21 key_skills_present (manual/env gate)

Additional smoke/release strings preserved by current docs and tests:

- [x] grok-plugins-surface=ok
- [x] grok-global-hook-bridge=ok
- [x] grok-installed-mcp-surface=ok
- [x] lfg-installed-symlink-surface=ok
- [x] aliases=lfg,ulw
- [x] lfg-inside-tmux-status=ok
- [x] lfg hook-bridge status/install
- [x] MCP `grok_build_hook_bridge`
- [x] release-tag=ok
- [x] team-preflight-cli=ok
- [x] team-preflight-commands=ok
- [x] team-provider-matrix=ok
- [x] team-provider-slash=ok
- [x] team-provider-commands=ok

Legacy/transition evidence strings (to be migrated or removed):
- [x] grok-plugins-surface=ok
- [x] grok-global-hook-bridge=ok
- [x] grok-installed-mcp-surface=ok
- [x] lfg-installed-symlink-surface=ok
- [x] aliases=lfg,ulw
- [x] lfg-inside-tmux-status=ok


### Active Skill Coverage Matrix

This table tracks the current active skill/runtime surfaces during the OMO migration. Historical aliases may still appear in evidence docs, but active runtime and smoke contracts must match this matrix.

| Feature | Migration status |
| --- | --- |
| `/ai-slop-cleaner` | Historical command-only compatibility surface; not an active skill/catalog surface |
| `/analyze` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/ask` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/autopilot` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/autoresearch` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/autoresearch-goal` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/cancel` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/code-review` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/configure-notifications` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/deep-interview` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/design` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/doctor` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/hud` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/setup` | Active canonical setup surface for install-plan, check, and show |
| `/performance-goal` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/pipeline` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/plan` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/ralph` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/ralplan` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/skill` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/team` | Active canonical non-trivial team execution surface |
| `/ultragoal` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/ultraqa` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/ultrawork` | Historical command surface retained for compatibility; active continuation surface is `loop`/`ulw` |
| `/visual-ralph` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/wiki` | Preserved transition surface; migrate to OMO semantics in M12 |
| `/worker` | Preserved transition surface; migrate to OMO semantics in M12 |

## Definition of Done

`lfg` is ready when:

1. All six OMO agent families are registered, default to role-fit profiles (Grok by default, GPT-style for Hephaestus), and require Grok Oracle review before completion.
2. Grok native sub-agent spawning is the preferred delegation mechanism, with approved external providers allowed for execution lanes.
3. Sisyphus, Prometheus, Hephaestus, Atlas, Sisyphus-Junior, and builtin-agents have runtime semantics, not just documentation.
4. Boulder, continuation, mailbox, tasklist, Team Mode, Hyperplan, and Ultrawork state are durable under `.lfg/`.
5. Legacy Codex-derived workflow identity is removed or explicitly migrated.
6. README, architecture docs, agent docs, smoke docs, and release docs describe the same product.
7. Self-tests, smoke gates, and real Grok verification pass with exact evidence strings.

## Open Decisions

1. Should existing `.lfg/` user state be migrated or can the OMO parity port break compatibility?
2. Should legacy command names be deleted immediately or retained as deprecated aliases for one release?
3. Should every agent use one Grok model profile or should categories map to different Grok reasoning levels?
4. Which Grok Build spawning API is stable enough to make mandatory in release gates?

## Atomic Commit Strategy

1. `docs: define omo grok build roadmap`
2. `docs: rewrite readme for omo agent parity`
3. `docs: replace architecture with omo hierarchy`
4. `docs: update agent guidance for omo port`
5. `test: add omo agent registry contracts`
6. `feat: add Grok-reviewed OMO agent registry`
7. `test: add multi-provider spawn adapter and Grok Oracle review contracts`
8. `feat: add Grok-reviewed multi-provider spawn adapter`
9. `feat: port omo categories and junior executor`
10. `feat: add omo boulder runtime state`
11. `feat: port omo team mode and hyperplan`
12. `feat: port prometheus atlas hephaestus ultrawork`
13. `feat: replace runtime mcp skills and hooks`
14. `test: update omo smoke and release gates`

This roadmap supersedes all previous Codex-workflow-centered versions.
