# PROJECT KNOWLEDGE BASE

Generated: 2026-05-18
Branch: feature/lfg-agent-orchestration-omo-parity

## OVERVIEW

Python-first Grok/LFG plugin package under `plugins/lfg`. The product goal is now **OMO agent hierarchy parity for Grok Build**: port Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, and builtin-agents into a Grok-model, Grok-native sub-agent orchestration runtime.

All future work should align with the OMO parity roadmap, not legacy Codex-derived workflow identity.

## STRUCTURE

```text
./
    plugins/lfg/      Grok plugin package and Python runtime
  tests/            Python smoke matrix and test guidance
  plugin smoke checks           Verification and release gates
  docs/             Architecture, test rules, smoke docs, release contracts
  ```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| OMO parity roadmap | `ROADMAP.md` | M0-M13 Grok Build agent hierarchy plan |
| Architecture | `docs/ARCHITECTURE.md` | Agent layer, Grok spawn adapter, Boulder, Team Mode |
| Agent-system docs | `docs/agent-system/` | Named agents, categories, templates, parity comparisons |
| **Grok Build / xAI platform SSOT** | `docs/reference.md` | Official xAI docs (https://docs.x.ai/overview) as Single Source of Truth for Responses API, function calling, reasoning traces, stateful interactions, and Grok-native capabilities. **Always consult before changing spawn adapter or claiming "Grok-native" behavior.** |
| **Grok Build prompt-stage map** | `docs/GROK-BUILD-PROMPT-STAGES.md` | Visual walkthrough of each prompt stage: official xAI Responses API substrate vs LFG/OMO orchestration layer. |
| **Docs Index Server (JSON)** | `docs/docs-index.json` | **@docs/ 참조 시 에이전트는 반드시 이 JSON 인덱스를 먼저 읽어야 함.** path를 찾아 Read tool로 실제 문서를 조회. docs/를 서버처럼 동작하게 만드는 계층. |
| CLI surface | `plugins/lfg/bin/lfg.py` | dependency-free Python runtime command router |
| Plugin runtime | `plugins/lfg/bin/lfg.py` | Dependency-free runtime, `.lfg` state, tmux backend, future spawn adapter |
| MCP server | `plugins/lfg/bin/lfg-mcp.py` | Stdio JSON-RPC tools for Grok plugin integration |
| Slash surfaces | `plugins/lfg/skills/*/SKILL.md` | Grok skill definitions to migrate to OMO semantics |
| Release gates | `plugin smoke checks `, `docs/SMOKE.md`, `docs/RELEASE_CHECKLIST.md` | Exact evidence strings are product contracts |
| Test rules | `docs/TEST_RULES.md` | Gate classes and deterministic test discipline |

## TARGET AGENT MAP

| Agent | Role | Target Runtime Behavior |
| --- | --- | --- |
| `Sisyphus` | Main orchestrator | Own intent, delegate, verify, advance Boulder |
| `Sisyphus-Junior` | Category executor | Execute bounded category tasks with evidence |
| `Prometheus` | Strategic planner | Interview, clarify, write verifiable plans |
| `Hephaestus` | Autonomous deep worker | Goal-oriented deep work and verification |
| `Atlas` | Todo-list orchestrator | Execute dependency waves until checklist done |
| `builtin-agents` | Factory/policy layer | Resolve Grok model, category, skills, overrides, blocked tools |

## CODE MAP

| Symbol or file | Type | Location | Role |
| --- | --- | --- | --- |
| `main` | Python function | `plugins/lfg/bin/lfg.py` | Runtime command router and migration hotspot |
| `lfg`, `ulw` | Shell wrappers | `plugins/lfg/bin/` | Default runtime identity and ultrawork launcher entrypoints |
| `lfg-mcp.py` | Python MCP server | `plugins/lfg/bin/lfg-mcp.py` | JSON-RPC tool schema contract |
| `RuntimeSmoke` | Python test class | `tests/smoke/test_grok_build_runtime.py` | Dependency-free feature matrix |

## CONVENTIONS

- Python runtime: `plugins/lfg/bin/lfg.py` stays dependency-free and resolves paths through `GROK_PLUGIN_ROOT` and `GROK_PLUGIN_DATA`.
- Agent runtime: all first-class agents must resolve to Grok model profiles.
- Spawning: Grok native sub-agent spawning is the target delegation path; local deterministic fallback is required for smoke tests.
- MCP: `lfg-mcp.py` stdout is JSON-RPC only. Stderr isolation is tested by `plugins/lfg/bin/self-test.sh MCP stdio section`.
- State: runtime state belongs in `.lfg/` or the configured `GROK_PLUGIN_DATA` tree.
- Team state: preserve legacy flat team-state compatibility until the M7/M8 state migration explicitly changes it.
- Verification: smoke gates emit exact `*=ok` evidence strings. Docs and tests assert those strings literally.
- Tests: classify every changed test as dependency-free smoke, repo-native integration, or environment/manual gate.

## ANTI-PATTERNS (THIS PROJECT)

- Do not reintroduce legacy Codex-derived workflow identity as the product goal.
- Do not claim OMO parity without runtime behavior and evidence.
- Do not claim Grok native spawning without official/local evidence.
- Do not add sleeps, retries, special ordering, or isolation flags as pass crutches.
- Do not weaken exact JSON, MCP, CLI, evidence, or prompt identity assertions when they define product behavior.
- Do not let MCP servers write logs or diagnostics to stdout.
- Do not run hook scripts without bounded timeouts or allow manifest/path inputs to escape the plugin root.
- Do not use real provider credentials, real Grok sessions, or real tmux sessions in dependency-free smoke tests.
- Do not create per-skill AGENTS files; parent guidance covers `plugins/lfg/skills/*`.
- Do not commit secrets or generated state from `.lfg/`, `.omx/`, `target/`, or local Grok installs.

## COMMANDS

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
python3 -m py_compile plugins/lfg/bin/lfg.py plugins/lfg/bin/lfg-mcp.py
python3 -m ruff check .
plugins/lfg/bin/self-test.sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
plugins/lfg/bin/self-test.sh
plugins/lfg/bin/grok-install-smoke.sh
plugins/lfg/bin/lfg setup
plugins/lfg/bin/self-test.sh MCP stdio section
lfg --json doctor state schema check
plugins/lfg/bin/self-test.sh
```

## NOTES

- Dirty worktree may contain pre-existing user changes; do not revert user changes unless explicitly asked.
- `.github/workflows/smoke.yml` runs `self-test.sh`; full local release readiness is `plugins/lfg/bin/self-test.sh`.
- Version surfaces must stay aligned between plugin manifests, runtime output, and smoke docs.
- The OMO parity migration should proceed phase-by-phase per `ROADMAP.md`.
- **Grok Build platform behavior**: Treat `docs/reference.md` (pointing at https://docs.x.ai/overview) as the authoritative external reference for Responses API, tool calling, reasoning content, and native capabilities. Do not make claims about "Grok-native spawning" or agent orchestration without cross-checking it.
