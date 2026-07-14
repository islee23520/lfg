# Repository Guidelines

**Generated:** 2026-07-09  
**Commit:** `37cd541`  
**Branch:** `main`  
**Mode:** init-deep update (max-depth 3)

## Project Overview

`@islee23520/lfg` is a single-purpose npm CLI (only command: `setup`) that ports **OpenCode OmO / lazycodex** behavior to **GrokBuild**. Running `setup --run` materializes an lfg-owned Grok plugin payload under `~/.grok/plugins/lfg` (with legacy `~/.grok/installed-plugins/lfg` as migration/fallback).

Lineage: **codex adapter core feature + opencode feature** from `https://github.com/code-yeongyu/oh-my-openagent`. Strategic posture (ADR `docs/grok-adapter-core-port-strategy.md`): upstream is a core/adapter monorepo — `omo-codex` is packaging reference only; `omo-opencode` is the architectural reference; shared `*-core` packages are the behavioral source. Phase 0 (codegraph), Phase 1 (rules), Phase 2 (model resolution), Phase 3 (prompt variants), Phase 5 (`delegate-core`/`boulder-state`), and the host-neutral slice of Phase 6 (`skills-loader-core`) are shipped; Phase 4 is partial. T2/T4/T5 moved `comment-checker`, `ast_grep`, and `lsp` to behavior-backed Grok-adapted status; the host-bound leftovers called out below remain Deferred/Manifest-only/Unsupported.

The npm package identity is deliberately distinct from the installed plugin: `lfgIsPlugin: false` in JSON contracts (the npm package is never reported as a Grok plugin object), even though `setup --run` installs a real Grok plugin payload.

## GrokBuild Parity Reference (oh-my-openagent)

This section makes AGENTS.md the canonical quick-reference for **GrokBuild parity vs `https://github.com/code-yeongyu/oh-my-openagent`** (upstream baseline `lazycodex-ai`/OMO `v4.16.3`, recorded per-setup in `lfg-component-inventory.json`). For the full row-by-row matrix with test citations, see `docs/grok-adapter-parity.md`; for the core/adapter port strategy and phase roadmap, see `docs/grok-adapter-core-port-strategy.md`.

**Strategic posture:** upstream is a core/adapter monorepo — `omo-codex` is packaging/install reference only, `omo-opencode` is the architectural reference, and shared host-neutral `*-core` packages are the behavioral source. In this repo, host-neutral OMO behavior lives under `src/core/omo`, lfg-owned host-neutral primitives live under `src/core/lfg`, and `src/grok` is the Grok adapter/install/runtime glue that consumes those cores.

**Status vocabulary:** `Implemented` · `Grok-adapted` · `Manifest-only` · `Remote URL manifest-only` · `Unsupported` · `Deferred`. Manifest-only MCP stubs must never be claimed as behavioral ports.

### OMO parity inspection gate

Run `npm run assert-omo-parity` for every OMO/lazycodex parity update, upstream refresh, skill sync, generated-payload edit, MCP runtime change, or change to `lfg-component-inventory.json`/`docs/grok-adapter-parity.md`/this AGENTS section. This gate builds first, then validates all three generated skill roots (`src/grok/skills`, package `skills`, and `dist/grok-install/skills`), manifest provenance/version, required managed skills, retired `lcx-*` removals, `agents/grok.yaml` conversion, `teammode`, deferred component status, docs wording, inventory baseline, and the build cache guard (`includeCache: false`).

For feature intake from a new upstream OMO/lazycodex version:
1. Inspect upstream package layout and hook/component deltas first; do not infer parity from `omo-codex` alone.
2. Classify each upstream component with the exact status vocabulary above. `lazycodex-executor-verify`, `workflow-selector`, `git-bash`, and `start-work-continuation` must stay non-behavioral unless a real Grok runtime/hook/tool surface is implemented and manually verified. `teammode` is Grok-adapted via spawn_subagent (host built-ins + lfg agents).
3. Sync upstream skills through `scripts/sync-omo-skills-to-grok.mjs`; do not hand-maintain copied OMO skill payloads except for explicit lfg conversions (`lfg-doctor`, `lfg-report-bug`, `lfg-contribute-bug-fix`) and Grok metadata conversion (`agents/openai.yaml` → `agents/grok.yaml`).
4. Verify both surfaces: `npm run assert-omo-parity` for generated payload integrity, and `node dist/lfg.js --json setup --run --install-only` against a temp Grok home for the installed plugin surface.
5. If claiming a deferred/manifest-only component became `Grok-adapted`, prove it with a non-empty runtime/hook/tool behavior test and a real setup-surface receipt. Do not mark status up based only on copied files or manifest presence.

### Core install parity (Codex reference → Grok owner)

| omo-codex capability | Grok owner (lfg) | Status |
|---|---|---|
| Plugin cache install | `src/grok/` → `~/.grok/plugins/lfg` | Implemented |
| `config.toml` merge | `lfg-grok-config.ts` (single-writer) | Implemented |
| Agent TOML + reasoning | `sync-lazycodex-agents-to-grok.ts` + native OMO agents | Implemented |
| Hook trust | `hook-trust.ts` + post-install verifier | Implemented |
| Install version stamp | `lfg-install.json` | Implemented |
| Internal verifier (doctor) | `grok-install/doctor.ts` (not public CLI) | Implemented |
| `cleanup` / `update` | re-run `setup --run` / `setup --run --force` | N/A by design |
| Model catalog | `lfg-models.ts` + `LAZYCODEX_*` | Implemented |
| Project `.omo` awareness | `assets/lfg-config-loader.mjs` (fail-closed) | Implemented |
| Extension hooks (LFP port) | `extension-hooks.ts` (native first-party; bridge for legacy) | Implemented |
| Per-agent model overrides | `lazycodex-agent-overrides.ts` | Implemented |
| Autonomous permissions | Grok permissions own this | N/A |
| Telemetry | not emitted by lfg | N/A |

### Full OMO component parity (upstream `v4.16.3`)

| Upstream component | lfg support | Status |
|---|---|---|
| `codegraph` | External `@colbymchenry/codegraph` binary, sha256-verified into `~/.omo/codegraph`, `.mcp.json` command server | **Grok-adapted** (Phase 0, shipped) |
| `rules` | `src/core/omo/rules-engine` + `rules-injector.ts` PostToolUse glue; native first-party hook | **Grok-adapted** (Phase 1, shipped) |
| `ultrawork` | Native first-party hook + agent prompts synced | **Grok-adapted** |
| `ulw-loop` | Project `.omo` awareness via fail-closed config loader; durable CLI packaged as `lfg ulw-loop` / `lfg ulw` | **Grok-adapted** |
| `ultimate-browsing` | Upstream OMO skill payload installed, including references/engine/scripts and Grok-converted agent metadata; no separate Grok-native stealth-browser runtime claimed | Implemented |
| `git-bash` | Local MCP stub, disabled on macOS via `disabled_mcp_servers` | Manifest-only |
| `lsp` | Local MCP runtime exposes `typescript_diagnostics` (T5); T8 residual WAIVE — MCP runtime Grok-adapted; automatic PostToolUse/PostCompact reinjection not claimed | Grok-adapted |
| `ast_grep` | Local MCP runtime exposes `ast_grep_search` with `sg` and deterministic fallback behavior (T4) | Grok-adapted |
| `grep_app` | Remote URL `https://mcp.grep.app`; shape-validated only | Remote URL manifest-only |
| `context7` | Remote URL `https://mcp.context7.com/mcp`; shape-validated only | Remote URL manifest-only |
| `comment-checker` | Native Grok PostToolUse hook emits bounded comment feedback and fail-closes on malformed JSON (T2) | Grok-adapted |
| `start-work-continuation` | Sisyphus native Stop/SubagentStop hooks substitute (host dependency class: Stop/SubagentStop hook) | Deferred |
| `teammode` | GrokBuild spawn_subagent transport + host built-ins and lfg OMO agents; Codex multi_agent_v2/codex_app still available on Codex | Grok-adapted |
| `lazycodex-executor-verify` | T3: pure `verifySubagentStopEvidence` in Sisyphus SubagentStop; no dedicated host-enforced CLI (host dependency class: Stop/SubagentStop hook) | Deferred |
| `workflow-selector` | Upstream removed from omo-codex components (#5745); lfg optional native opt-in retained, Deferred pending GrokBuild host receipt | Deferred |
| `difficulty-tier-workers` | Host-neutral resolver + Grok roles/agents/prompts + config model/effort + orchestrator `spawn_subagent` (`lazycodex-worker-low|medium|high`); not host auto-classification | Grok-adapted |
| `plan-mode-interception` | No verified Grok `enter_plan_mode` intercept; `/ulw-plan` is hook-time guidance only (host dependency class: missing host surface; T9 residual WAIVE #102) | Deferred |
| `bootstrap` | lfg does not bootstrap Codex runtime deps from Grok (host dependency class: policy / no Codex bootstrap from Grok; T9 residual WAIVE #102) | Deferred |
| `auto-update` | Updates stay user-controlled; hook not generated | Unsupported |
| `test-support` | Upstream package test infrastructure, not a Grok plugin runtime component | Unsupported |
| `telemetry` | lfg does not emit upstream anonymous telemetry | Unsupported |

### Core/adapter port roadmap

| Phase | Capability | Classification | Status |
|---|---|---|---|
| 0 | codegraph MCP + provisioning | CORE + GLUE | Shipped |
| 1 | Rules / AGENTS.md context engine | CORE + GLUE | Shipped |
| 2 | Model resolution / fallback (`model-core`) | CORE + HOST-BOUND | Shipped |
| 3 | Prompt variants + routing (`prompts-core`) | CORE + GLUE | Shipped |
| 4 | Sisyphus / Hephaestus agent prompt builders | GLUE + HOST-BOUND | Shipped (partial) |
| 5 | Delegation / orchestration (`delegate-core`, `boulder-state`) | Mixed | Shipped |
| 6 | Skills loading (`skills-loader-core`, `shared-skills`) | Mixed | Shipped (host-neutral core); OpenCode-bound layers deferred |

### Gap analysis

**Real GrokBuild surface gaps** (OpenCode surfaces with no Grok equivalent — require Grok-specific alternatives):
- `experimental.chat.system.transform` — per-turn system-prompt mutation. Workaround: static system-prompt assembly at SessionStart.
- `experimental.chat.messages.transform` — full message-history rewrite.
- `chat.params` — mutable model params/headers before dispatch.
- `experimental.session.compacting` — compaction-context preservation. Workaround: persistence-based recovery.

**Dual parity scores** (see `docs/grok-adapter-parity.md` Current Parity Score): **Score A GrokBuild adapter scope = 100/100** (in-contract `~/.grok` install/cores/hooks/MCP/skills complete; **out of contract** = `omo-senpi`/`senpi`/`~/.senpi`, app-server, `codex_app`, auto-reinject, missing-host intercepts — reference only, no fake Grok-adapted flips). **Score B Full OMO host surface = 89/100** is the **last audited T0–T11 score snapshot** (baseline pin **rebaselined to v4.16.3**; baseline 88; +1 WAIVE residual bookkeeping only; **no in-train status-promotion score Δ**). Post-audit **status** promotions (`teammode`, `difficulty-tier-workers`, …) update the component table honestly but are **not** assigned ad hoc Score B points until a future full re-score applies one formula across all rows. Evidence: `T11-score.txt`, `DUAL-SCORE-100-adapter-scope.md`, issues [#98](https://github.com/islee23520/lfg/issues/98)–[#104](https://github.com/islee23520/lfg/issues/104).

**Behavioral ports still owed for Score B** (currently Manifest-only / Deferred on the component table; see `docs/grok-orchestration-plane.md` for host dependency classes):
- `git-bash` — Windows behavior remains unverified; macOS disables it through `disabled_mcp_servers`.
- `lsp` lifecycle hook automation — **T8 residual WAIVE:** MCP runtime Grok-adapted; automatic PostToolUse/PostCompact reinjection not claimed (language-service lifecycle; not a cheap pure-file hook like comment-checker); issue **#101**.
- `start-work-continuation` (host dependency class: Stop/SubagentStop hook) — Sisyphus native Stop/SubagentStop hooks ship substitute guidance + durable `lfg ulw-loop` CLI for checkpoint/resume; present-path `getStopHookContinuationContext` names the durable CLI and explicitly denies automatic reinjection; automatic reinjection remains unclaimed (Deferred); follow-up **#99**.
- `lazycodex-executor-verify` (host dependency class: Stop/SubagentStop hook) — pure function MVP + T3: `verifySubagentStopEvidence` wired into `lfg-sisyphus-hooks.mjs` SubagentStop for coding|hephaestus|builder (`.omo/evidence` WARNING/VERIFIED + fail-closed malformed JSON; e2e proven). Remains **Deferred**: no dedicated component CLI / host-enforced block-or-continue; follow-up **#98**.
- `teammode` — **Grok-adapted** via `spawn_subagent` transport: host built-ins (`general-purpose`, `explore`, `plan`) + lfg OMO agents (`hephaestus`, `explorer`, `coding`, …). Durable `.omo/teams` + `team-ledger`. Residual: no `codex_app`/MultiAgentV2 mailbox on Grok (leader + artifacts). Codex transports remain for Codex hosts.
- `workflow-selector` — **upstream removed** from omo-codex components (#5745 on path to v4.16.3). lfg optional `lfg-native-workflow-selector.mjs` retained as historical opt-in; remains **Deferred** (no Grok-adapted claim without authenticated host receipt).
- `difficulty-tier-workers` — **Grok-adapted:** host-neutral `resolveDifficultyTierRoute` + installed `lazycodex-worker-low|medium|high` roles/models/effort; start-work/ulw-loop guide orchestrator `spawn_subagent` tier selection. Residual honesty: not host-enforced automatic classification, OpenCode transforms, Codex `agent_type`, or MultiAgentV2 mailbox.
- `plan-mode-interception` (host dependency class: missing host surface) — **T9 residual WAIVE** (issue #102): `/ulw-plan` is hook-time guidance only; no native `enter_plan_mode` intercept claimed.
- `bootstrap` (host dependency class: policy / no Codex bootstrap from Grok) — **T9 residual WAIVE** (issue #102): policy hold; lfg does not bootstrap Codex runtime deps from Grok.
- Z.AI vision MCP (#89) is **shipped** via `lfg zai mcp install vision` (built-in, not Deferred). Configures `[mcp_servers.zai-vision]` in `~/.grok/config.toml`. Full companion plugin (`@islee23520/lfg-mcp`) provides xAI Grok MCP runtime as decoupled companion.

**Model-family detector gap** (Phase 2 risk, now mitigated): `model-core` family detectors (`isGptModel`, `isGeminiModel`, `isClaudeOpus*Model`, …) do not match `xai/grok-*` IDs; the Grok adapter supplies `availableModels`/`connectedProviders` normalized to `provider/model-id` and maps Grok models into variant families so they don't fall to the `default` variant.

**Prompt-builder gap** (Phase 4 residual): bundled `src/core/omo/prompts-core/prompts/*` markdown covers atlas/prometheus/ultrawork/mode, and `src/core/omo/agent-builder` owns the agent-builder foundation plus a curated builtin registry. Full Sisyphus/Hephaestus/Sisyphus-junior equivalence is still host-bound and must stay Deferred unless those builders are ported and verified against a real Grok runtime surface.

**MCP Companion & Z.AI Packaging Notes (release train):**
- `@islee23520/lfg-mcp` ships as **decoupled companion** (separate npm publish, not in lfg core payload). Provides xAI Grok MCP runtime under `~/.grok/plugins/lfg-mcp` + Z.AI integration. Preferred install: `npx @islee23520/lfg-mcp setup` or bridged `lfg mcp companion install/status`.
- Core lfg includes thin `lfg zai` subcommands for auth (`set-api-key`/`logout` to `~/.grok/zai-mcp-auth.json`) and `[mcp_servers.zai-*]` config.toml entries (vision, web-search, web-reader, zread) without companion. Use companion for full plugin tree + xAI stdio ownership; use built-in for minimal config.
- **Smoke checklist:**
  1. `npm run verify` (build + parity + test + typecheck + self-test)
  2. `node dist/lfg.js --json setup --run` confirms core + no companion bleed
  3. `node dist/lfg.js zai mcp status` (expects auth-required without key)
  4. `lfg zai auth set-api-key --api-key sk-test-zai --mode ZAI` + `lfg zai mcp install all` + `lfg zai mcp status`
  5. Verify `~/.grok/config.toml` has zai sections + no leaked keys in output
  6. `npm run assert-omo-parity` (guards MCP manifests, inventory)
  7. Confirm `lfgIsPlugin: false`, `companionPackage: "lfg-grok-install"` contract
  8. Post-setup Grok `/mcps` shows xai/zai entries (local stdio vs remote); avoid OAuth shortcut for xai_grok
- Release discipline: lfg-mcp follows independent train (own pre-publish gates). Z.AI uses official @z_ai/mcp-server via npx; keep decoupled to avoid monolith bloat. No runtime changes to core lfg install for companion.

## Architecture & Data Flow

Three-layer pipeline:

```
bin/lfg.js (sh shim)
  └─> dist/lfg.js (src/cli/command/lfg.ts — routing/contract)
        └─> src/cli/setup/lfg-installer.ts (runLazycodexInstaller)
              └─> src/grok/install/run-grok-install.ts (runGrokInstall — single transaction)
                    ├─ resolveExistingStampedLfgSetup() | runInternalGrokInstall()  [payload materialize]
                    ├─ writeGrokModelConfig()                  → ~/.grok/config.toml
                    ├─ writeOmoAgentOverridesFile() + ensureLfgConfigFiles()
                    ├─ syncLazycodexAgentsToGrokLedger()        → ~/.grok/plugins/lfg/agents|prompts
                    ├─ ensureLfgPluginsEnabled/AgentsPreferred/SubagentModels()
                    └─ normalizePluginHooksJson() + ensure{CuaDriver,UlwWorkflow,Hephaestus}*
```

`runGrokInstall()` is the **single install transaction** with two branches: (1) existing stamped setup (not `--force`) → "preserve" mode that skips full re-copy and only re-syncs config/agents/hooks/skills; (2) fresh/forced → `runInternalGrokInstall()` then the same post-install sync. Post-install steps run in **both** branches and are idempotent. Hooks are deliberately re-normalized on every run ("always loaded" invariant).

Runtime hook execution (separate process spawned by Grok):
```
Grok event → lfg-native-rules.mjs (or lfg-native-ultrawork.mjs)
  └─> spawn lfg-grok-hook-bridge.mjs  node <plugin>/components/<x>/dist/cli.js hook <event>
        └─> component CLI (buildRuleContext / runCodegraphSessionStart / etc.)
```

The bridge (`src/grok/assets/hooks/lfg-grok-hook-bridge.mjs`, staged into the plugin) translates Grok camelCase hook JSON → Codex-shaped stdin, maps `GROK_PLUGIN_ROOT`→`PLUGIN_ROOT`, and fail-closes on malformed JSON. Bridge wrapping MUST be idempotent (peel outer bridge layers, then apply exactly one) — a historical root-cause of hook breakage was non-idempotent `wrapLazyCodexHookCommand` stacking wrappers.

Routing in `lfg.ts:dispatch()`:
- `--refresh --run` → `refreshGrokModelConfig()` (config.toml only; never touches plugin tree)
- `--run` / `setup --force` → `runLazycodexInstaller()` (mutating)
- `--json setup` (no run) → `setupPlan()` (non-mutating machine surface)
- Bare `lfg setup` on TTY → dynamic-import `lfg-setup-tui.js` → `runSetupTui()`; `--no-tui`/non-TTY → `runInstallWizard()` (readline)

Emit discipline: `--json` always prints structured value; `--run` prints only captured stdout/stderr; bare interactive setup prints nothing from `result` (wizard owns the conversation).

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI routing / JSON contract | `src/cli/` | `command/`, `setup/`, `setup-json-contract.ts` |
| Install transaction | `src/grok/install/` | `runGrokInstall` single hub |
| Host-neutral OMO cores | `src/core/omo/` | No `src/grok` / `src/cli` imports (`core-boundary.test.ts`) |
| Config.toml writer | `src/cli/config/lfg-grok-config.ts` | Install-time single-writer |
| Hook normalize / bridge | `src/grok/hooks/`, `src/grok/assets/hooks/` | Idempotent wrap invariant |
| Skill sync / parity | `scripts/sync-omo-skills-to-grok.mjs`, `skills/`, `src/grok/skills/` | Three roots gated by `assert-omo-parity` |
| Doc phrase contracts | `docs/` + `src/cli/docs/*-doc.test.ts` | 1:1 by filename stem |
| Build / publish gates | `scripts/` | `build.mjs`, assert-pack, assert-omo-parity |

## CODE MAP

| Symbol | Type | Location | Refs (role) |
|--------|------|----------|-------------|
| `dispatch` / `main` | fn | `src/cli/command/lfg.ts` | Process entry; emit rules |
| `runLazycodexInstaller` | fn | `src/cli/setup/lfg-installer.ts` | CLI → install; `installJson` shape |
| `runGrokInstall` | fn | `src/grok/install/run-grok-install.ts` | Single install transaction |
| `runInternalGrokInstall` | fn | `src/grok/install/run-internal.ts` | Payload materialize + MCP |
| `resolveGrokSetupHome` | fn | `src/grok/install/grok-home.ts` | High fan-in; prod vs test-home gate |
| `writeGrokModelConfig` | fn | `src/cli/config/lfg-grok-config.ts` | Sole install-time config.toml writer |
| `normalizePluginHooksJson` | fn | `src/grok/hooks/normalize-plugin-hooks.ts` | Global `lfg-hooks.json` + bridge |
| `syncLazycodexAgentsToGrokLedger` | fn | `src/grok/agents/sync-lazycodex-agents-to-grok.ts` | Agent TOML + prompts |
| `materializeGrokMcpRuntimes` | fn | `src/grok/mcp/materialize-grok-mcp.ts` | MCP runtimes / codegraph |
| `resolveModelWithFallback` | fn | `src/core/omo/model-core/` | Host-neutral model pipeline |
| `findRuleFiles` / `buildRuleContext` | fn | `src/core/omo/rules-engine/` + `src/grok/ports/rules-injector.ts` | Rules core + Grok glue |
| `setupPlan` | fn | `src/cli/setup/setup-plan.ts` | Non-mutating `--json setup` |

## Key Directories

| Directory | Purpose |
|---|---|
| `bin/` | Published npm bin shim (`bin/lfg.js`, POSIX `sh` → `node dist/lfg.js`). |
| `src/core/omo/` | Host-neutral upstream-derived OMO core behavior (`model-core`, `rules-engine`, `prompts-core`, `agent-builder`, `delegate-core`, `boulder-state`, `skills-loader-core`). No Grok/CLI imports. |
| `src/core/lfg/` | lfg-owned host-neutral primitives shared by CLI and adapters, such as subagent mapping helpers. No Grok filesystem ownership. |
| `src/core/adapter/` | Host capability types (`HostAdapterCapabilities`). Grok fills them in `src/grok/adapter/`. |
| `src/shared/` | Tiny cross-layer helpers (`json.ts`, `coding-tool-adapter.ts`). |
| `src/cli/` | CLI entry, JSON contracts, plan/installer/publish helpers, dense contract tests. High-risk contract hotspot — has its own `AGENTS.md`. |
| `src/grok/` | Grok adapter/install/runtime glue: payload materialization, hook normalization, agent TOML sync, MCP runtimes, and adapter facades over `src/core/*`. High-risk install hotspot — has its own `AGENTS.md`. |
| `skills/` | Tarball skill tree: OMO-synced managed skills + hand-maintained `lfg/`, `cua-driver/`, supplemental `xai-*`. See `skills/AGENTS.md`. |
| `dist/` | Generated runtime bundle + staged install payload (`dist/grok-install/`). Regenerated by build; do not edit. |
| `scripts/` | Root build (`build.mjs`) and publish/readiness gates. Has its own `AGENTS.md`. |
| `docs/` | Tested-contract docs (each doc has a 1:1 `*-doc.test.ts` under `src/cli/docs/`). Has its own `AGENTS.md`. |
| `components/` | Three tiny MCP helper shims (ast-grep/git-bash/lsp), dist-only; `.mcp.json` + `dist/cli.js` forwarder. Do not broaden product runtime. |
| `tests/` | Policy-only pointer; real tests live under `src/cli/`, `src/core/`, `src/grok/`. Has its own `AGENTS.md`. |
| `plans/` | Planning history; not product surface. |

Materialized plugin payload shape (under `~/.grok/plugins/lfg`, not shipped statically):
```
hooks/{hooks.source.json, lfg-grok-hook-bridge.mjs, lfg-native-rules.mjs, lfg-native-ultrawork.mjs, lfg-sisyphus-hooks.mjs}
components/{ast-grep,git-bash,lsp}/{.mcp.json,dist/cli.js}   (+ vendored rules/, ultrawork/)
mcp-runtimes/{ast-grep-mcp,lsp-daemon,git-bash-mcp}/dist/cli.js
skills/{ulw-plan,ulw-loop,cua-driver}/SKILL.md
agents/*.md, prompts/omo/   (Grok-native OMO agents + role routes)
assets/lfg-config-loader.mjs
lfg-install.json, lfg-component-inventory.json
```

Active hook registration is global: `~/.grok/hooks/lfg-hooks.json`. Plugin-local `hooks/hooks.json` is removed after normalization; `hooks/hooks.source.json` is retained only as the lfg-owned normalized source payload for idempotent repair.

Adjacent `~/.grok` writes (lfg-owned): `config.toml` (`[omo.agents.*]`, `[omo.models]`, `[subagents.*]`, `[endpoints]`, `[model.*]` sections), `omo-agent-overrides.json` (legacy `lazycodex-agent-overrides.json` filename still readable as fallback), `~/.grok/agents/*.toml` + `~/.grok/prompts/omo/*.md`. Retired `[lazycodex.*]` config namespaces are stripped on setup/refresh/purge. Legacy `~/.grok/prompts/lazycodex` prompts are migrated into `omo` and removed during setup.

## Development Commands

```sh
npm run build              # esbuild bundle + asset staging (scripts/build.mjs)
npm test                   # build + vitest on src/cli, src/core, src/grok (exclude src/grok/skills/**/*.test.ts)
npm run typecheck          # tsc --noEmit
npm run assert-omo-parity  # build + validate upstream-derived OMO parity payloads
npm run assert-skills-smoke # every skills/*/SKILL.md + scripts syntax + cheap CLI probes
npm run test:ulw-loop      # unit + lifecycle TDD suite for durable ulw-loop
npm run coverage:ulw-loop  # v8 coverage gate for ulw-loop (ratchet toward 100%; floors in vitest.config.ts)
npm run self-test          # build + node dist/self-test.js (smoke harness)
npm run verify             # assert-pack → assert-omo-parity → assert-skills-smoke → npm test → coverage:ulw-loop → typecheck → self-test
npm run assert-pack        # node scripts/assert-npm-pack-bin.mjs
# optional publish helpers (no package.json aliases):
#   node scripts/pre-publish-check.mjs
#   node scripts/assert-npm-publish-auth.mjs
#   node scripts/record-publish-gap.mjs
```

Runtime smoke:
```sh
node dist/lfg.js --json setup         # non-mutating plan
node dist/lfg.js --json setup --run   # structured Grok install result
```

`vitest.config.ts` sets `fileParallelism: false` (serial) to avoid `npm pack`/setup/model-server flakes, and injects `env: { LFG_ALLOW_TEST_GROK_HOME: "1" }` globally.

## Code Conventions & Common Patterns

- **Toolchain:** npm + esbuild + TypeScript only. NEVER add Bun scripts or runtime dependencies. Root `package.json` is the only publish target.
- **JSON CLI output is a contract.** `setup-json-contract.ts` maintains `DEPRECATED_SETUP_JSON_KEYS` denylist + `findDeprecatedSetupJsonKeys()`. Update matching tests when fields/wording change. Key invariants: `lfgIsPlugin: false`, `companionPackage === "lfg-grok-install"`, never emit `@islee23520/lfp` or deprecated keys.
- **Grok-first framing** everywhere. Default setup path is `~/.grok`; do NOT route through `npx lazycodex-ai install` into `~/.codex` (codex is optional/legacy). Model routing may prefer OMO-equivalent GPT/Gemini/Claude primaries when explicitly configured or discovered, but installed Grok surfaces must retain Grok-compatible fallbacks.
- **Production home resolution:** `resolveGrokSetupHome()` (`src/grok/install/grok-home.ts`) targets `os.userInfo().homedir`. Only tests may redirect, gated by `LFG_ALLOW_TEST_GROK_HOME=1` (with optional `LFG_TEST_GROK_HOME` explicit override).
- **Idempotent installs:** `runGrokInstall()` post-install steps run in both preserve and fresh branches and must be idempotent. Existing stamped setups are preserved unless `--force` is explicit.
- **Config writer discipline:** `writeGrokModelConfig()` (`lfg-grok-config.ts`) is the install-time writer to `~/.grok/config.toml`'s lfg-owned sections. The only hook-time exception is `lfg-config-loader.mjs` **seeding** `[models].default` from `[omo.models].default` on `SessionStart` — seed-only: it writes the default only when none exists, and **never overwrites** an existing `[models].default`, so the user's (or Grok's) chosen model persists across sessions (OpenGrok: Grok Build free to use many models). Endpoints hygiene: set only `endpoints.models_base_url`, remove legacy `endpoints.api_key`, put single-endpoint credentials under `[model.*]`, and omit the single global key when discovery has provider-specific endpoints. Grok OIDC auth is host-owned — lfg does NOT write `~/.grok/auth.json`.
- **Agent overrides priority:** user > discovered config > bundled OMO-equivalent defaults with Grok-compatible fallbacks. `lazycodex-agent-overrides.json` is the user-visible legacy surface; `omo-agent-overrides.json` is the current lfg surface.
- **API keys:** never print API keys in JSON output, logs, or summaries. Tests use fake keys (`sk-test`).
- **Bridge wrapping must be idempotent** — peel outer bridge layers, then apply exactly one.
- **Status honesty:** parity status vocab is `Implemented` / `Grok-adapted` / `Manifest-only` / `Remote URL manifest-only` / `Unsupported` / `Deferred`. Do not claim Manifest-only MCP stubs as behavioral ports.
- **No dead aliases / commented-out removals** — remove obsolete code at the source.

## Important Files

### Entry points & bin wiring
- `bin/lfg.js` — POSIX `sh` shim → `node dist/lfg.js` (tries `$script_dir/../dist/lfg.js`, then nested `@islee23520/lfg/dist/lfg.js`, else errors "run npm run build first"). This is the npm package bin that `npx`/global install exposes; it is the plain lfg tool, NOT the grok wrapper.
- `~/.grok/bin/lfg` — the **grokbuild wrapper**, generated by `ensureGrokBinLfgWrapper(home)` during `lfg setup --run` (both fresh and preserve branches, idempotent, chmod 0755). It lives co-located with `~/.grok/bin/grok` (the PATH dir Grok itself uses), so `lfg` is on PATH wherever `grok` is. lfg-owned first args (`setup`/`xai`/`zai`/`mcp`/`ulw`/`ulw-loop`/`help` and lfg-only flags) exec `npx -y @islee23520/lfg "$@"`; bare interactive and every other invocation (`-p`, `-m`/`--model`, `--yolo`, `login`, `models`, …) forward raw args to `$HOME/.grok/bin/grok` (PATH `grok` fallback). Owner of the wrapper: `src/grok/install/grok-bin-lfg-wrapper.ts`.
- `src/cli/command/lfg.ts` — process entry: `main()` → `parseArgs()` → `dispatch()` → `emit()`.
- `package.json` — `@islee23520/lfg@0.1.26`, `"type": "module"`, single bin, `files: [bin, dist, skills, README.md, AGENTS.md, src/AGENTS.md]`.

### CLI surface (`src/cli/`)
- `lfg-installer.ts` — `runLazycodexInstaller()` → delegates to `runGrokInstall()` + `verifyGrokInstallSurface()` + `installJson()`.
- `src/cli/setup/setup-plan.ts` — non-mutating plan builders (`setupPlan()`, `refreshPlan()`).
- `setup-json-contract.ts` — deprecated-key guards.
- `src/cli/models/lfg-models.ts` — `fetchModelDiscovery()` (GET `/v1/models`), `applyModelPreset()` (`grok`/`gpt`), `defaultLazycodexAgentConfig()`.
- `src/cli/config/lfg-grok-config.ts` (+ `-toml.ts`, `-sections.ts`) — config.toml single-writer; `LFG_OWNED_GROK_CONFIG_SECTIONS`.
- `src/cli/setup/lfg-setup-tui.ts` (+ `-selectors.ts`, `-data.ts`, `-agents.ts`) — `@clack/prompts` TUI (`shouldUseSetupTui()`, `runSetupTui()`).
- `src/cli/setup/lfg-interactive.ts` — `runInstallWizard()` (readline fallback).
- `src/cli/publish/{bin,auth,registry,readiness,layout,pack,workflow}/` — pack/publish gating helpers.

### Install engine (`src/grok/`)
- `src/grok/install/run-grok-install.ts` — `runGrokInstall()` single transaction.
- `src/grok/install/run-internal.ts` — `runInternalGrokInstall()` payload materialization; source resolution priority: OMO native → lazycodex bundle → `LFG_GROK_INSTALL_SOURCE_ROOT` override → fixture fallback (with `warning`).
- `src/grok/payload/install.ts` — `installGrokPluginFromSource()` plugin path helpers.
- `src/grok/agents/sync-lazycodex-agents-to-grok.ts` — `syncLazycodexAgentsToGrokLedger()`; `GROK_AGENT_NAMES` table; `moveConflictingUserAgentsAside()`.
- `src/grok/hooks/normalize-plugin-hooks.ts` — `normalizePluginHooksJson()` idempotent Grok event-map writer.
- `grok-plugins-enable.ts` — `ensureLfgPluginsEnabled/AgentsPreferred/SubagentModels`, `upsertSubagentModels()`.
- `src/grok/mcp/materialize-grok-mcp.ts` — `materializeGrokMcpRuntimes()`; `resolveMcpTarget()` (runtime_packages vs components mode).
- `src/grok/install/grok-home.ts` — `resolveGrokSetupHome()` (production vs test-home gate).
- `src/grok/mcp/codegraph-manifest.ts` / `codegraph-provision.ts` / `codegraph-resolve.ts` / `codegraph-session-start.ts` / `codegraph-node-support.ts` — OpenCode OmO codegraph port (sha256-verified download to `~/.omo/codegraph`).
- `src/core/omo/rules-engine` + `src/grok/ports/rules-injector.ts` — OpenCode OmO rules core plus Grok PostToolUse glue over picomatch-based matcher/finder/scanner.
- `src/grok/assets/config/lfg-config-loader.mjs` — fail-closed `.omo` context loader (mirrors the test-home gate).
- `src/grok/fixture/` — seed plugin payload used by tests and the fallback install path.

### Configs
- `tsconfig.json` — `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, `noEmit: true` (esbuild emits), `verbatimModuleSyntax: true`, `isolatedModules: true`, `types: [node, vitest/globals]`.
- `vitest.config.ts` — `fileParallelism: false`, global `LFG_ALLOW_TEST_GROK_HOME=1`.
- `scripts/build.mjs` — esbuild bundle of 8 entry points (only `lfg-setup-tui` externalizes `@clack/prompts` + `picocolors`), `dist/.build.lock` with 120s timeout, atomic `rename` staging of `fixture`, generates `mcp-runtimes/*` stubs, chmod 0755 outputs.

## Runtime/Tooling Preferences

- **Runtime:** Node (target node20). NEVER Bun.
- **Package manager:** npm. Root `package.json` is the only publish target; no nested manifests.
- **Build:** esbuild via `scripts/build.mjs` (8 entry points bundled ESM, sourcemaps, platform node).
- **Publish from repo root**, never from `src/`. Lifecycle: `prepack` → `npm run build`; `prepublishOnly` → `npm test`.
- Runtime deps are intentionally minimal: `@clack/prompts`, `picocolors`, `picomatch`, `zod`. devDeps: `@types/node`, `esbuild`, `typescript`, `vitest`.
- Publish gates exit `2` when not-ready so `prepublishOnly`/CI fail loudly.

## Testing & QA

**Framework:** Vitest (`^4.0.14`, ESM). Tests live under `src/cli/`, `src/core/`, and `src/grok/` (skills tree excluded). `npm test` globs those three trees.

**Test categories:**
1. **CLI / JSON contract** — exact field assertions on `--json setup` / `--json setup --run` output (`setup-json-contract.test.ts`, etc.).
2. **Script/gate contract** — static-read gate `.mjs` text and assert required strings/order (`verify-script.contract.test.ts`, `build-script.contract.test.ts`, `assert-npm-pack-bin.contract.test.ts`, `pre-publish-check.contract.test.ts`).
3. **Integration** (`.integration.test.ts`) — spawn real `npm run assert-pack`, `npm view`, etc.
4. **Acceptance** (`.acceptance.test.ts`) — full `runGrokInstall` / hook-trust / config-single-writer e2e against temp homes.
5. **Doc-contract** (`*-doc.test.ts`) — assert `docs/` markdown contains exact phrases/cross-references. Editing a doc requires editing its paired test in the same change. Doc↔test mapping is by filename stem.

**Testing patterns:**
- **Spawned CLI:** `src/cli/test/test-process.ts` exports `runLfg(args, env)` → `{exitCode, json}`; auto-builds `dist/` once per process if missing.
- **Temp homes:** `mkdtemp(join(tmpdir(), "lfg-...-"))` + `{ HOME: home }` env, relying on the global gate.
- **File fixtures:** `src/grok/fixture/` copied into temp plugin roots.
- **Explicit vitest imports:** `import { describe, expect, test } from "vitest"`.
- **Fake keys** (`sk-test`) — never real API keys.

**Test-home gate (`LFG_ALLOW_TEST_GROK_HOME`):** the load-bearing safety invariant. `vitest.config.ts` sets it globally; `resolveGrokSetupHome()` honors it (on → `LFG_TEST_GROK_HOME` or `HOME`; off/unset → `userInfo().homedir`). Production never routes through a temp/alternate home. Related hooks: `LFG_NPM_WHOAMI` (force unauthenticated for publish-auth tests), `LFG_DISABLE_DEFAULT_MODELS_PROXY`.

**Coverage expectation:** observable behavior — JSON field shapes, branch conditions, idempotency, error handling, doc wording. Do not test defaults or tautologies. Contract tests must not be weakened to land wording changes.
