# How lfg Works — End-to-End Runtime Overview

This document explains how the entire `lfg` system operates, from agent definitions to Team Mode execution and verification. It serves as the single narrative that connects all documents under `docs/`.

## 1. Core Goal

`lfg` ports the **complete OMO (oh-my-openagent) agent hierarchy** into Grok Build as a real agent operating system.

- Sisyphus owns intent and Boulder
- Prometheus plans
- Atlas executes dependency waves
- Hephaestus does deep autonomous work
- Sisyphus-Junior handles category-bounded tasks
- builtin-agents resolves models, categories, and policies

Most agents run on Grok models (`xai/grok-4.3`). Hephaestus is the intentional exception and uses its approved GPT-style deep-specialist profile. Grok-native sub-agent spawning is the target delegation path. Team Mode provides the durable multi-agent coordination layer.

## 2. Agent Registry (Source of Truth)

The canonical registry lives at:

```
plugins/lfg/src/agents/
├── sisyphus.json
├── sisyphus-junior.json
├── prometheus.json
├── hephaestus.json
├── atlas.json
└── builtin-agents.json
```

Each JSON defines:
- `id`, `name`, `family`, `role`
- `modelProfile` (Grok-first for most agents; Hephaestus is the approved GPT-style exception)
- `reasoningLevel`
- `categories` the agent is allowed to handle
- `tools` and `blockedTools`

`load_omo_agent_registry()` in `plugins/lfg/src/runtime/cli.py` reads these files at runtime and builds the in-memory registry used by `lfg agents list`, `lfg agents inspect`, `spawn_agent()`, and MCP tools.

Historical custom agent names are reference material only. They are **not** part of the first-class OMO registry and are not valid team-spec members.

## 3. Grok Spawn Adapter

Entry point: `lfg spawn <agent_id> --category <c> --task "..."`

Flow inside `spawn_agent()`:
1. Look up agent in `_OMO_REGISTRY_INDEX`
2. Validate category (if provided)
3. Call `resolve_omo_model_profile()` → resolves the approved model profile and appropriate reasoning level for the selected agent/category
4. Return structured fallback envelope + persist record under `.lfg/runs/spawns/<uuid>.json`

Real Grok-native `spawn_subagent` call is still behind a manual gate (see `docs/evidence/grok-subagent-spawning.md`). Until the gate is removed, the adapter provides deterministic fallback behavior for smoke tests and local development.

## 4. Team Mode (Currently Active)

When `team_mode.enabled=true`:

- `team_create`, `team_task_create`, `team_send_message`, `team_status` become the primary orchestration interface.
- `TeamRuntime` + `TeamStateStore` + `TeamMailbox` + `TeamTasklist` manage durable state under `.lfg/runs/<mode>-<id>/`.
- Sisyphus can spawn other OMO agents via the spawn adapter and coordinate them through the team mailbox/tasklist.

Existing flows (`ulw`, `team`, `ralph`) already use this layer. Once OMO-named agents become the default spawnees, `team_create → team_task_create + team_send_message` becomes the standard delegation pattern.

## 5. State & Persistence

All durable runtime state lives under `.lfg/` (or `$GROK_PLUGIN_DATA`):

```
.lfg/
├── boulder/
├── plans/
├── teams/
├── hyperplan/
├── mailbox/
├── tasklists/
├── runs/<mode>-<id>/
└── state/
```

`doctor` and `lfg --json doctor state schema check` enforce schema versioning and migration history.

## 6. Verification Culture (Evidence Contracts)

This project treats exact evidence strings as product contracts.

- `python3 plugins/lfg/bin/self-test.py` must emit dozens of `*=ok` lines.
- `docs/SMOKE.md` defines every gate (local, Grok install, tmux lifecycle, MCP isolation, marketplace source, hook discovery, etc.).
- `docs/TEST_RULES.md` classifies every test as:
  - Dependency-free smoke
  - Repo-native integration
  - Environment/manual gate
- `docs/RELEASE_CHECKLIST.md` lists 30+ mandatory gates before merge or tag.

No claim is accepted without a matching evidence string.

## 7. Document Map

| Document | Purpose | Key Contract |
|----------|---------|--------------|
| `ARCHITECTURE.md` | Current runtime implementation + vision | Team Mode section, spawn adapter status |
| `AGENTS.md` (root + docs/) | Project knowledge base & documentation rules | SSOT for OMO parity language |
| `SMOKE.md` | All smoke procedures and expected evidence | `*=ok` strings are binding |
| `TEST_RULES.md` | Test classification rules | TR-001 ~ TR-008 |
| `RELEASE_CHECKLIST.md` | Pre-merge / pre-tag checklist | 30+ gates |
| `reference.md` | Official Grok Build / xAI platform docs | Always consult before claiming "Grok-native" |
| `GROK-BUILD-PROMPT-STAGES.md` | Visual prompt lifecycle map | Separates official xAI substrate from LFG/OMO orchestration |
| `GROK-EXTENSIONS-SSOT.md` | Grok extension discovery and compatibility guide | Skills, plugins, hooks, marketplace, subagent, Claude Code, and AGENTS.md discovery rules |

## 8. Current Execution Flow (Team Mode ON)

1. User invokes `lfg spawn ...` or `lfg team create ...`
2. `src/runtime/cli.py` loads the 6 OMO agents via `load_omo_agent_registry()`
3. `builtin-agents` resolves model + reasoning level for the requested category
4. `spawn_agent()` or `team_create()` executes
5. Team Mode coordinates mailbox/tasklist between spawned agents
6. All results are written to `.lfg/`
7. `lfg doctor`, `lfg status`, or `self-test.py` verifies evidence strings

---

**Last updated**: May 2026 (after Team Mode activation and ARCHITECTURE.md Team Mode section refresh)

This document should be updated whenever the runtime implementation or verification contracts change.
