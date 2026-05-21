# PROJECT KNOWLEDGE BASE

Generated: 2026-05-18
Branch: feature/lfg-agent-orchestration-omo-parity

## OVERVIEW

TypeScript/Bun Grok/LFG plugin package under `plugins/lfg`. The product goal is now **OMO agent hierarchy parity for Grok Build**: port Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, and builtin-agents into a Grok-model, Grok-native sub-agent orchestration runtime.

All future work should align with the OMO parity roadmap, not legacy Codex-derived workflow identity.

## STRUCTURE

```text
./
    plugins/lfg/      Grok plugin package and TypeScript/Bun runtime
  tests/            Bun smoke matrix and test guidance
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
| CLI surface | `plugins/lfg/bin/lfg.ts` | dependency-free gateway into `plugins/lfg/src/runtime-ts/index.ts` |
| Plugin runtime | `plugins/lfg/src/runtime-ts/index.ts` | Dependency-free runtime, `.lfg` state, tmux backend, future spawn adapter |
| MCP server | `plugins/lfg/bin/lfg-mcp.ts` | Stdio JSON-RPC tools for Grok plugin integration |
| Internal hooks | `plugins/lfg/hooks/`, `plugins/lfg/scripts/hook_bridge/` | TypeScript hook harness, global bridge installer/verifier helpers, and hook evidence contracts |
| Slash surfaces | `plugins/lfg/skills/*/SKILL.md` | Grok skill definitions to migrate to OMO semantics |
| Agents-compatible metadata | `.agents/plugins/marketplace.json` | Compatibility marketplace metadata only; do not add runtime hooks or OMO logic here |
| Release gates | `plugins/lfg/bin/self-test.ts`, `docs/SMOKE.md`, `docs/RELEASE_CHECKLIST.md` | Exact evidence strings are product contracts |
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
| `main` | TypeScript function | `plugins/lfg/src/runtime-ts/index.ts` | Runtime command router and migration hotspot |
| `lfg.ts` | Bun gateway | `plugins/lfg/bin/lfg.ts` | Thin loader for `src/runtime-ts/index.ts` |
| `lfg`, `ulw` | Shell wrappers | `plugins/lfg/bin/` | Default runtime identity and ultrawork launcher entrypoints |
| `lfg-mcp.ts` | TypeScript MCP server | `plugins/lfg/bin/lfg-mcp.ts` | JSON-RPC tool schema contract |
| `RuntimeSmoke` | Bun test suite | `plugins/lfg/src/smoke-ts/` | Dependency-free feature matrix |

## CONVENTIONS

- TypeScript runtime: `plugins/lfg/src/runtime-ts/index.ts` stays dependency-free and resolves paths through `GROK_PLUGIN_ROOT` and `GROK_PLUGIN_DATA`; `plugins/lfg/bin/lfg.ts` is a thin gateway only.
- Agent runtime: all first-class agents must resolve to Grok model profiles.
- Spawning: Grok native sub-agent spawning is the target delegation path; local deterministic fallback is required for smoke tests.
- MCP: `lfg-mcp.ts` stdout is JSON-RPC only. Stderr isolation is tested by the MCP section of `plugins/lfg/bin/self-test.ts`.
- MCP tool names in `plugins/lfg/src/mcp/tools.json` are OMO-native short names and `tools.ts` is only the loader. Legacy `grok_build_*` aliases may be accepted in dispatch for compatibility, but must not be exposed as canonical tools.
- Hooks: critical active-goal events call `plugins/lfg/hooks/scripts/lfg-goal-harness.ts` (thin router) which delegates to `plugins/lfg/src/hooks-ts/`. Real implementation lives under `src/hooks-ts/` as independent modules (state_io, todo_continuation, injection, dispatch_gate, etc.). Global hook bridge logic lives in small TypeScript modules under `plugins/lfg/scripts/hook_bridge/`; entry scripts should stay thin.
- `.agents/` is compatibility metadata, not a place for internal hook implementation. Keep internal hook behavior under `plugins/lfg/hooks/` or `plugins/lfg/scripts/hook_bridge/`.
- State: runtime state belongs in `.lfg/` or the configured `GROK_PLUGIN_DATA` tree.
- Team state: preserve legacy flat team-state compatibility until the M7/M8 state migration explicitly changes it.
- Verification: smoke gates emit exact `*=ok` evidence strings. Docs and tests assert those strings literally.
- All five `AGENTS.md` guides are part of the product contract and must stay structurally complete; `bun plugins/lfg/bin/self-test.ts` proves this with `agents-guides-valid=ok`.
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
- Do not add shell testing scripts (`*.sh`) for smoke/release gates; use Bun/TypeScript for better output control and test integration.

## COMMANDS

```sh
bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils
bun plugins/lfg/bin/self-test.ts
plugins/lfg/bin/lfg setup
bun plugins/lfg/bin/self-test.ts
lfg --json doctor state schema check
bun plugins/lfg/bin/self-test.ts
```

## NOTES

- Dirty worktree may contain pre-existing user changes; do not revert user changes unless explicitly asked.
- `.github/workflows/smoke.yml` runs `bun plugins/lfg/bin/self-test.ts`; full local release readiness is `bun plugins/lfg/bin/self-test.ts`.
- Version surfaces must stay aligned between plugin manifests, runtime output, and smoke docs.
- The OMO parity migration should proceed phase-by-phase per `ROADMAP.md`.
- **Grok Build platform behavior**: Treat `docs/reference.md` (pointing at https://docs.x.ai/overview) as the authoritative external reference for Responses API, tool calling, reasoning content, and native capabilities. Do not make claims about "Grok-native spawning" or agent orchestration without cross-checking it.
