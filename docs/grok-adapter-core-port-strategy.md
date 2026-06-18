# Grok adapter core/adapter port strategy (ADR)

**Status:** Accepted (2026-06-18, upstream `oh-my-openagent@dev` core/adapter analysis)
**Complements:** [`docs/grok-adapter-parity.md`](grok-adapter-parity.md) (install/component parity), [`docs/grok-adapter-ownership.md`](grok-adapter-ownership.md) (product framing)

`lfg` is the npm entry for the **omo / lazycodex GrokBuild port** and **Grok Build plugin payload** (core **codex adapter** feature + **opencode** lineage from https://github.com/code-yeongyu/oh-my-openagent). The package/JSON contract keeps `lfgIsPlugin: false` because the npm package object is not reported as a Grok plugin object; `setup --run` installs the lfg-owned Grok plugin payload under `~/.grok/plugins/lfg`.

## Background: upstream is a core/adapter monorepo

Analysis of `code-yeongyu/oh-my-openagent` (branch `dev`, `omo-codex@4.11.1`, `omo-opencode@0.1.1`) shows the upstream is **not** a single `omo-codex` package. It is a monorepo with a **core/adapter split**:

- **Platform adapters** (thin host shims):
  - `packages/omo-codex` — Codex adapter. Depends only on `@oh-my-opencode/utils`. It is a Codex installer + vendored plugin component bundle (command hooks, MCP manifest, agent TOMLs, marketplace). `omo-codex` is **packaging/install surface**, not the behavioral source of truth.
  - `packages/omo-opencode` — OpenCode adapter (Ultimate edition). Depends on **all** `*-core` packages plus `@opencode-ai/plugin` + `@opencode-ai/sdk` (1.15.x). Its `createPluginModule()` injects cores into OpenCode lifecycle hooks. This is the **architectural reference** for how cores surface in a host.
- **Shared cores** (pure TS, host-neutral behavior): `model-core`, `rules-engine`, `prompts-core`, `comment-checker-core`, `delegate-core`, `boulder-state`, `team-core`, `telemetry-core`, `skills-loader-core`, `shared-skills`, `agents-md-core`, `hashline-core`, `tmux-core`, `openclaw-core`, `claude-code-compat-core`, `mcp-client-core`, `mcp-stdio-core`, `utils`.
- **Platform launcher packages** (`oh-my-opencode-darwin-arm64`, etc.) are Bun/Node launcher scripts, **not** compiled native runtimes embedding OpenCode.

### Dependency evidence

- `packages/omo-codex/package.json`: `"dependencies": { "@oh-my-opencode/utils": "workspace:*" }` — no cores.
- `packages/omo-opencode/package.json`: depends on `agents-md-core`, `boulder-state`, `comment-checker-core`, `delegate-core`, `hashline-core`, `mcp-client-core`, `model-core`, `openclaw-core`, `prompts-core`, `rules-engine`, `shared-skills`, `skills-loader-core`, `telemetry-core`, `tmux-core`, `team-core`, plus `@opencode-ai/plugin` / `@opencode-ai/sdk`.

## Decision: shift from `omo-codex` 1:1 mapping to a core-consuming Grok adapter

The previous parity approach mapped `omo-codex` capabilities 1:1. That produced many **Manifest-only / Deferred** entries (comment-checker, lsp, git-bash, ast_grep) — install scaffolding without behavioral substance, because the real logic was never in `omo-codex`.

The strategic direction now mirrors the upstream architecture:

> **lfg keeps its Grok-native installer, but ports the shared `*-core` behavioral packages and writes a thin Grok adapter that feeds Grok host capabilities into those cores.**

- **Keep**: Grok-native install/config/hook/agent/stamp surface (`src/grok-adapter/`, `src/cli/`). This is already correct and well-tested.
- **Demote**: `omo-codex` becomes a **packaging/install reference only** — no longer the behavioral source of truth.
- **Reference**: `omo-opencode` is the **architectural reference** for how a host adapter wires cores into lifecycle hooks (see seam map below).
- **Port**: shared `*-core` packages (host-neutral TS) become the behavioral source.

## How cores surface in a host (seam map, from `omo-opencode`)

`omo-opencode`'s DI root (`create-plugin-module.ts`) wires cores into OpenCode lifecycle hooks. The host provides: project `directory/cwd`, session id, agent/model metadata, available models + connected providers, a tool registry, and lifecycle hook surfaces. Cores return resolved models, prompts, rule context, tool results.

| OpenCode host surface | Core consumed | Grok equivalent | Gap |
|---|---|---|---|
| `tool.execute.before` / `tool.execute.after` | `comment-checker-core`, `rules-engine`, `agents-md-core`, `hashline-core` | `PreToolUse` / `PostToolUse` | None (maps cleanly) |
| `experimental.chat.system.transform` | `prompts-core` prompt assets | (none direct) | **Gap** — Grok needs dynamic system-prompt injection per turn |
| `experimental.chat.messages.transform` | context/team/validator hooks | (none direct) | **Gap** — full message-history rewrite |
| `chat.params` | `model-core` capabilities/settings | (none direct) | **Gap** — mutable model params before dispatch |
| `chat.message` | `model-core` fallback, `boulder-state` | (none direct) | Partial |
| delegate-task / `call_omo_agent` | `delegate-core`, `model-core` | subagent/task system | Maps via Grok subagents |
| `skill` / `skill_mcp` | `skills-loader-core`, `shared-skills` | MCP tools + skills | Maps |
| edit (hashline) | `hashline-core` | edit tool wrapper | Maps |
| codegraph MCP | `utils/codegraph` wrapper (external binary) | `.mcp.json` command server | Maps cleanly |

### Real GrokBuild gaps

GrokBuild provides `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, a subagent/task system, MCP tool registration, and TOML/JSON config. The genuinely absent OpenCode surfaces are: `experimental.chat.system.transform` (per-turn system prompt mutation), `experimental.chat.messages.transform` (history rewrite), `chat.params` (mutable model params/headers), and `experimental.session.compacting` (compaction context preservation). Cores that depend on those surfaces need Grok-specific alternatives (e.g. static system-prompt assembly at SessionStart, persistence-based compaction recovery).

## Port roadmap (priority order)

Each row classifies port effort per the consumed core's host coupling: **CORE** (vendor verbatim), **GLUE** (thin Grok wrapper over a core), **HOST-BOUND** (significant Grok rework).

| Phase | Capability | Upstream source | Classification | Effort | Dependency | Status |
|---|---|---|---|---|---|---|
| 0 | **codegraph** MCP + provisioning | `packages/utils/src/codegraph/` + `omo-opencode/mcp/codegraph.ts` + `omo-codex/components/codegraph` | CORE + GLUE | Low | None (self-contained) | Shipped |
| 1 | Rules / AGENTS.md context engine | `packages/rules-engine` (verbatim) + Grok `PostToolUse` glue | CORE + GLUE | Low–Med | None | Shipped |
| 2 | Model resolution / fallback | `packages/model-core` (verbatim) + Grok model-catalog adapter + `xai/grok-*` family mapping | CORE + HOST-BOUND | Med | None | Shipped |
| 3 | Prompt variants + routing | `packages/prompts-core/prompts/*` (markdown) + variant resolver + Grok variant table | CORE + GLUE | Med | Phase 2 | Pending |
| 4 | Sisyphus / Hephaestus agent prompt builders | `omo-opencode/src/agents/*` (TS builders) | GLUE + HOST-BOUND | High | Phase 2, 3 | Pending |
| 5 | Delegation / background orchestration | `delegate-core`, `boulder-state` + Grok subagent mapping | Mixed | High | Phase 2 | Pending |
| 6 | Skills loading | `skills-loader-core`, `shared-skills` | Mixed | Med | None | Pending |

### Why codegraph is Phase 0 (parallel-safe, self-contained)

CodeGraph is an **external** semantic-code-graph MCP binary (`@colbymchenry/codegraph`); the graph intelligence lives in the binary, not in OMO. OMO only wraps it: provisions the platform binary (sha256-verified download into `~/.omo/codegraph`), bootstraps it at session start, and registers `codegraph serve --mcp` as an MCP server. Because Grok natively supports `.mcp.json` command servers and lfg already materializes MCP manifests (`src/grok-adapter/materialize-grok-mcp.ts`) plus native SessionStart hooks, the codegraph port is host-neutral, low-effort, and has no dependency on the other core ports. It proceeds in parallel with Phase 1+.

Upstream codegraph layers: `packages/utils/src/codegraph/{env,resolve,provision,node-support,workspace}.ts` (shared, host-neutral), `omo-codex/plugin/components/codegraph/{serve,hook,session-start-worker}.ts` (Codex wrapper), `omo-opencode/src/hooks/codegraph-bootstrap/` (OpenCode SessionStart), `omo-opencode/src/mcp/codegraph.ts` (`createCodegraphMcpConfig`), config schema `{auto_provision, enabled, install_dir, telemetry, watch_debounce_ms}`.

### Model family mapping note (Phase 2 risk)

`model-core`'s `resolveModelPipeline()` is a pure function over `{ availableModels, connectedProviders }`. But its family detectors (`isGptModel`, `isGeminiModel`, `isKimiK2Model`, `isGlmModel`, `isClaudeOpus*Model`, …) do **not** match `xai/grok-*` IDs, so Grok models fall to the `default` variant unless lfg adds a Grok family detector/variant table. The Grok adapter must supply `availableModels`/`connectedProviders` (normalized to `provider/model-id`) and map Grok models into variant families.

### Prompt content location note (Phase 3–4)

Bundled markdown prompts live in `packages/prompts-core/prompts/` (atlas, prometheus, ultrawork, mode). But Sisyphus / Hephaestus / Sisyphus-junior prompt content is built by TS builders under `omo-opencode/src/agents/*` — vendoring only `prompts-core/prompts` is insufficient for those agents; their prompt builders (or generated output) must also be ported.

## What lfg must not do

- Treat `omo-codex` as the behavioral source of truth; it is packaging/install reference only.
- Port `omo-opencode` wholesale; it is the architectural reference, and parts are irreducibly OpenCode-bound (`@opencode-ai/plugin`/`sdk`, `experimental.*` hooks).
- Assume `oh-my-opencode-*` platform packages embed a reusable native runtime; they are launcher scripts.
- Ship manifest-only MCP stubs as if they were behavioral ports (honest status tracking only).
- Bypass the Grok-native installer; cores feed into the existing `~/.grok/plugins/lfg` payload.

## Evidence

- Upstream trees and package.json read via `gh api repos/code-yeongyu/oh-my-openagent` (branch `dev`).
- Adapter seam, rules-engine consumption, and model/prompts-core wiring analyzed from source.
- Install parity and component status: [`docs/grok-adapter-parity.md`](grok-adapter-parity.md).
- Product framing and ownership: [`docs/grok-adapter-ownership.md`](grok-adapter-ownership.md).
