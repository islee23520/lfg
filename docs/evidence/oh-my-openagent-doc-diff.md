# Document Diff — LFG vs Local Oh My OpenAgent Reference

## Purpose

Compare LFG's current `@docs/` story with the local Oh My OpenAgent reference tree so future OMO parity work can see what is already ported, what is adapted for Grok Build, and what remains different.

Requested reference path:

```text
/Users/ilseoblee/.config/opencode/plugins/oh-my-openagents
```

Actual local path used for this diff:

```text
/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent
```

The requested plural path does not exist locally; the singular path is the installed reference repository.

## Source Documents Read

### LFG

- `docs/docs-index.json`
- `AGENTS.md`
- `docs/AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/HOW-IT-WORKS.md`
- `docs/GROK-BUILD-PROMPT-STAGES.md`
- `docs/agent-system/omo-parity-comparison.md`
- `docs/agent-system/omo-runtime-implementation-plan.md`
- `docs/evidence/grok-subagent-spawning.md`
- `docs/evidence/m1-grok-spawning-evidence-plan.md`

### Oh My OpenAgent

- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/README.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/docs/guide/overview.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/docs/guide/orchestration.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/docs/guide/team-mode.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/agents/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/agents/builtin-agents/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/tools/delegate-task/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/features/background-agent/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/features/team-mode/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/features/boulder-state/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/hooks/keyword-detector/AGENTS.md`
- `/Users/ilseoblee/.config/opencode/plugins/oh-my-openagent/src/hooks/atlas/AGENTS.md`

## Executive Diff

| Area | Oh My OpenAgent reference | LFG current docs | Diff status |
| --- | --- | --- | --- |
| Product substrate | OpenCode plugin, TypeScript, npm package `oh-my-opencode` / `oh-my-openagent`. | Grok Build marketplace plugin plus Rust CLI/library and dependency-free Python runtime. | Intentional platform adaptation. |
| Core agent count | 11 built-in agents: Sisyphus, Hephaestus, Oracle, Librarian, Explore, Multimodal-Looker, Metis, Momus, Atlas, Prometheus, Sisyphus-Junior. | 6 first-class OMO agents: Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, builtin-agents. Legacy `lina/gonow/iz/grok` remains compatibility-only. | Partial parity; LFG has the main execution spine but not the full consultant/search cast as first-class Grok agents. |
| Model philosophy | Multi-model orchestration. Different agents/categories map to Claude, GPT, Gemini, Kimi, GLM, etc. | Every first-class OMO agent resolves to Grok (`xai/grok-4.3`) with category-specific reasoning. | Intentional divergence. LFG is Grok-only by project contract. |
| Agent factories | Dynamic TypeScript factory layer: raw agent factories, conditional `maybeCreate*Config`, model resolution, overrides, skill filtering. | Static JSON registry loaded by `load_omo_agent_registry()` into `_OMO_REGISTRY_INDEX`. | LFG is simpler and more deterministic; less runtime configurability. |
| Prompt composition | Runtime dynamic prompt builder stitches identity, policy, tools, category skills, environment context. | Agent identity lives mostly in JSON registry + skill docs + Python runtime envelopes. | Gap: dynamic prompt assembly is not yet ported as a first-class system. |
| Delegation | `task(category=...)` routes to Sisyphus-Junior; `task(subagent_type=...)` invokes specific agents; background/sync modes supported. | `spawn_agent()` validates registry/category, resolves Grok profile, returns `fallback_manual_gate`; `spawn_wave()` and dependency graph are skeletons. | Major runtime gap: LFG has the contract and fallback envelope, not full live delegation parity. |
| Background execution | `BackgroundManager`: launch → queue → run → poll → completed/error/cancelled, concurrency keyed by provider/model. | LFG documents spawn envelopes and TeamRuntime; no equivalent full background manager in docs/runtime. | Gap. LFG needs either Grok task integration or a documented fallback manager. |
| IntentGate | Keyword detector scans first user message for `ultrawork`, search, analyze, team; injects mode-specific prompts. | `detect_ulw_intent()` / `activate_ulw_mode()` exist, and prompt-stage docs describe intent gate. | Partial parity: ultrawork path exists; broader search/analyze/team keyword stack is not fully equivalent. |
| Team Mode default | OFF by default; enabled via `team_mode.enabled`; 12 `team_*` tools appear only when enabled. | Current project environment treats Team Mode as active; docs describe `team_*` as official coordination surface. | Contextual difference. LFG docs should keep distinguishing “enabled in this environment” from product default if that changes. |
| Team eligibility | `eligible`: sisyphus, atlas, sisyphus-junior; `conditional`: hephaestus; `hard-reject`: oracle, librarian, explore, multimodal-looker, metis, momus, prometheus. | LFG target maps TeamRuntime to OMO agents, but current docs do not encode a full eligibility registry artifact. | Gap: eligibility exists as documentation target, not a runtime contract like OMO's `AGENT_ELIGIBILITY_REGISTRY`. |
| Team state | `~/.omo/teams/{name}` and runtime state with inboxes/tasks/worktrees; atomic locks and delivery reservations. | `.lfg/runs/<mode>-<id>/teams/...`, `TeamStateStore`, mailbox/tasklist, state-schema verification. | Partial adaptation. LFG mirrors concepts but uses a different state root and simpler implementation. |
| Boulder | `.omo/boulder.json` schema v2 tracks active plan, sessions, task sessions, status, worktree path; Atlas/todo hooks enforce continuation. | `.lfg/` stores Boulder/current-goal/current-plan pointers; docs say Boulder state is durable and schema-validated. | Partial parity. LFG has the concept and state roots; not all OMO boulder schema fields/hooks are ported. |
| Atlas continuation | Continuation-tier hook monitors session idle, incomplete todos, background tasks, model/session lineage, and injects continuation prompts. | Atlas is a first-class JSON agent and Team Mode substrate; no equivalent rich hook stack documented in LFG. | Gap: idle continuation and verification reminders need explicit LFG equivalents. |
| Prometheus | Planner is read-only, interview-mode, `.md`-only via hook, uses Metis and Momus loops for gap analysis / plan review. | Prometheus is `plan-only`, blocks edit/write in JSON, creates plans under `.lfg/plans/`; Metis/Momus not first-class in LFG registry. | Partial parity. Core Prometheus exists, but Metis/Momus review loop is not first-class. |
| Hyperplan | Team Mode powers `hyperplan` with hostile critics; docs mention 5 hostile agents. | `agent-system/hyperplan-teams.md` describes OmO-inspired adversarial templates; runtime docs say Hyperplan is starting to reference OMO catalog. | Partial parity; architecture present, full runtime evidence still pending. |
| Tooling | LSP, AST-grep, session tools, background tools, skill MCPs, hashline edit, team tools. | LFG has CLI/MCP/plugin surfaces and smoke gates; docs intentionally avoid adding new MCP for `@docs/`. | Intentional scope cut for docs-index work; broader tool parity remains separate. |
| Verification style | Extensive Bun tests, AGENTS maps, doctor checks, hook tests, team-mode tests. | Dependency-free Python smoke, `self-test.sh`, release-readiness scripts, exact `*=ok` evidence strings. | Equivalent discipline, different tooling stack. |

## Detailed Notes by Capability

### 1. Agent catalog

Oh My OpenAgent's `src/agents/AGENTS.md` documents 11 built-in agents, with a distinction between `primary` and `subagent` modes. The primary order is `Sisyphus → Hephaestus → Prometheus → Atlas`. LFG intentionally narrows the first-class runtime set to six Grok-backed OMO roles: `sisyphus`, `sisyphus-junior`, `prometheus`, `hephaestus`, `atlas`, and `builtin-agents`.

Implication: LFG has a clean Grok-native spine, but Oracle, Librarian, Explore, Metis, Momus, and Multimodal-Looker are still missing as first-class Grok registry entries if the goal is full 11-agent parity.

### 2. Model resolution

Oh My OpenAgent uses a multi-provider fallback model system. Its docs repeatedly emphasize choosing the right model for the right task. LFG's docs require the opposite invariant for first-class OMO agents: every first-class agent resolves to Grok, currently `xai/grok-4.3`, with category-specific reasoning levels.

Implication: this is not a bug. It is the central product adaptation: OMO semantics, Grok Build substrate.

### 3. Delegation and spawn

Oh My OpenAgent's delegation path is mature: `task(category=...)`, `task(subagent_type=...)`, background/sync execution modes, model/category resolution, skill injection, concurrency, and completion polling. LFG's `spawn_agent()` currently validates the registry and category, resolves a Grok model profile, writes a spawn record, and returns `fallback_manual_gate`.

Implication: LFG documentation is currently honest. Do not rewrite docs to claim full spawn parity until the manual gate in `docs/evidence/grok-subagent-spawning.md` is replaced by recorded evidence.

### 4. Team Mode

Oh My OpenAgent Team Mode is opt-in and bounded: 12 tools, explicit eligibility, mailbox, tasklist, worktrees, optional tmux, atomic locks, and no nested teams. LFG has TeamRuntime, mailbox, tasklist, and mode-separated `.lfg/runs/<mode>-<id>/` state, but the docs do not yet show a full eligibility registry or OMO-grade state delivery semantics.

Implication: LFG's Team Mode is structurally aligned but should not claim exact OMO runtime parity yet.

### 5. Boulder and continuation

Oh My OpenAgent's Boulder system is concrete: `.omo/boulder.json` schema v2 with active plan, work IDs, session IDs, task session reuse, worktree scope, and continuation hooks. LFG documents Boulder and `.lfg/` durability, but the current docs present it at a higher abstraction level.

Implication: future LFG docs should either add a `.lfg/boulder` schema document or keep Boulder described as a parity target until the smoke/state-schema evidence covers it.

### 6. Prompt-stage documentation

Oh My OpenAgent has multiple diagrams in `docs/guide/overview.md` and `docs/guide/orchestration.md` that explain IntentGate → Sisyphus → planner/executor/worker layers. LFG now has `docs/GROK-BUILD-PROMPT-STAGES.md`, which adds an important distinction absent from OMO: official xAI Responses API substrate vs. LFG/OMO orchestration layer.

Implication: this is a useful LFG-specific improvement. It should remain indexed by `docs/docs-index.json` and cross-linked from architecture docs.

## Recommended Follow-up Diffs

1. Add a first-class LFG eligibility contract mirroring OMO's `AGENT_ELIGIBILITY_REGISTRY`.
2. Add a `.lfg/boulder` schema doc that explicitly maps OMO `.omo/boulder.json` fields to LFG state roots.
3. Decide whether Oracle/Librarian/Explore/Metis/Momus/Multimodal-Looker become first-class Grok registry entries or stay external helper roles.
4. Keep `docs/GROK-BUILD-PROMPT-STAGES.md` as the entry point for prompt-flow explanation and keep `docs/reference.md` as the source of truth for xAI platform claims.
5. Do not add an MCP docs search tool for this comparison; `docs/docs-index.json` remains the intended `@docs/` lookup server.

## Status

This is a documentation diff only. It does not claim new runtime behavior and does not modify MCP, spawn adapter, Team Mode, or Boulder code.

**Last updated**: 2026-05-19.
