# omo-codex → Grok parity (lfg owner)

Status column updated during `.omo/plans/grok-native-omo-hooks.md` execution (T11 checkbox).

`lfg` is the npm entry for the **omo / lazycodex GrokBuild port** and **Grok Build plugin payload** (core **codex adapter** feature + **opencode** lineage from https://github.com/code-yeongyu/oh-my-openagent). The package/JSON contract keeps `lfgIsPlugin: false` because the npm package object is not reported as a Grok plugin object; `setup --run` installs the lfg-owned Grok plugin payload under `~/.grok/plugins/lfg`.

`setup --run` installs **native Grok hooks** (first-party OMO/lfg hook payloads as native Grok lifecycle events) and **Grok-native OMO agent surfaces** (default Hephaestus discipline, ultrawork, lfg-owned Sisyphus/Atlas planning and research surfaces, and role agents). It uses **bridge fallback** only for legacy/imported hooks. **Grok-first OMO parity** is achieved via native hooks + native agents + `~/.grok` payload under `~/.grok/plugins/lfg` (with legacy `~/.grok/installed-plugins/lfg` as migration/fallback, and `lfg-install.json` plus `lfg-component-inventory.json` for verification).

Issue #36 separates already-shipped core install parity from full OMO component parity.

## Agent/Model Source Map

The T5 upstream agent/model declaration mapping is tracked in
`docs/grok-adapter-agent-model-source-map.md`.

## Core Install Parity

| omo-codex capability | Codex reference | Grok owner (lfg) | Status |
|----------------------|-----------------|------------------|--------|
| Plugin cache install | `~/.codex/plugins/cache/sisyphuslabs/omo/` | `src/grok-adapter/` | Implemented (`plugin-cache-install.acceptance.test.ts` #27; `setup-doctor-parity.test.ts` postInstallVerify #21) |
| `config.toml` merge | `install/config.mjs` | `grok-install` + `lfg-grok-config.ts` | Implemented (`config-single-writer.acceptance.test.ts` #29; `lfg-installer.contract.test.ts`; `lfg-grok-config.endpoints` #24; `grok-config-endpoints-doc.test.ts`; `docs/grok-config-endpoints.md`; `LFG_OWNED_GROK_CONFIG_SECTIONS`) |
| Agent TOML + preserve reasoning | `install/agents.mjs` | `grok-install/apply-agent-tomls.ts` + `sync-lazycodex-agents-to-grok.ts` | Implemented (`agent-tomls.acceptance.test.ts` #30; `apply-agent-tomls.test.ts`; `sync-lazycodex-agents.test.ts`; `no-linalab-branding.test.ts`). `setup --run` now materializes native OMO agent surfaces, including a Grok-native OMO Hephaestus default prompt and lfg-owned Sisyphus/Atlas planning and research prompts. |
| Hook trust | `install/hook-trust.mjs` | `grok-install/hook-trust.ts` | Implemented (`hook-trust.acceptance.test.ts` #28; `post-install-verify.test.ts`; internal verifier `hooksRegistered`) |
| Install version stamp | `lazycodex-install.json` | `lfg-install.json` (Grok plugin root) | Implemented (`plugin-cache-install.acceptance.test.ts` #27; `npm-publish-root-contract.test.ts` #22; `publish-gap-evidence-shape.test.ts`) |
| Internal verifier | `src/cli/doctor/checks/codex.ts` | `grok-install/doctor.ts` (not public CLI) | Implemented (`doctor-pack-layout.acceptance.test.ts` #25; `doctor-json-contract.test.ts` #31; `setup-doctor-parity.test.ts` #21; `publish-owner-checklist.test.ts`; `registry-bin-publish-gap.test.ts`; `publishGap` #22) |
| `cleanup` / `update` | passthrough CLI | `docs/grok-cleanup-update.md` | N/A (`grok-cleanup-update-doc.test.ts` #34; re-run `setup --run`) |
| ulw-loop / start-work skills | plugin components + project `.omo` ledger | Grok plugin tree + `grok-install/assets/lfg-config-loader.mjs` | Implemented for lfg-owned hook-time project `.omo` awareness (`project-omo-ledger.test.ts`; `lfg-config-loader.test.ts`; `omo-loader-runtime.integration.test.ts`): concise active work/status/plan/worktree plus ledger existence and line count only; no ledger tail/content; malformed `.omo` fails closed. Upstream components remain vendored/brownfield. |
| Project-local `.grok` repair | `project-local-cleanup.mjs` | `grok-install/project-local.ts` | N/A (internal inspect helper; public CLI remains setup-only; automated repair deferred — `repair` field in JSON; `lfg-project-local.test.ts` #28) |
| Model catalog | `model-catalog.json` | `lfg-models.ts` + `LAZYCODEX_*` | Implemented (`lfg-models.mapping.test.ts`; `lfg-models.urls.test.ts`; setup discovery env) |
| Autonomous permissions | `permissions.mjs` | N/A or Grok permissions | N/A |
| Telemetry | plugin telemetry | vendored in tree | N/A (upstream plugin telemetry; lfg does not emit) |
| Extension hooks (LFP port) | legacy LFP | `grok-install/extension-hooks.ts` | Implemented (`post-install-ported-hooks.test.ts` #32; `extension-hooks.test.ts`; `extension-hooks.catalog.test.ts`; `hook-trust`). **Grok setup installs native first-party OMO hooks**; bridge fallback used only for legacy/imported hooks. |
| Extension agent overrides (LFP port) | legacy LFP | `grok-install/agent-overrides.ts` | Implemented (`agent-overrides.test.ts` #30; `apply-agent-tomls.ts` merge) |
| Per-agent model overrides (LFP-style) | LFP `omo-agent-model-overrides` + `agent-config` | `lazycodex-agent-overrides.ts` + `sync-lazycodex-agents-to-grok.ts` | Implemented (`lazycodex-agent-overrides.test.ts`; `~/.grok/lazycodex-agent-overrides.json`; interactive setup) |

## Full OMO Component Parity

Current upstream baseline: `lazycodex-ai` / OMO `v4.10.0`
(https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.10.0), latest
as of 2026-06-15. `lfg-component-inventory.json` records this baseline in each
fresh Grok setup so installed support can be audited against the tracked OMO
release while keeping lfg focused on the GrokBuild port and installed Grok plugin payload.

Upstream component inventory is from
`oh-my-openagent/packages/omo-codex/MARKETPLACE.md` at
`0764d4a399d1b189677b70020fc57c2b3cbc0e13`. Each row cites the upstream source
plus the local owner/test surface. The status vocabulary for this table is:
`Implemented`, `Grok-adapted`, `Manifest-only`, `Remote URL manifest-only`, `Unsupported`, or `Deferred`.

The `v4.10.0` refresh brings forward upstream release metadata and confirms that
the Grok adapter should keep its existing scope: runtime/bootstrap provisioning,
Windows ARM publishing, Kimi K2.7 prompt/model routing, atomic Codex config
writes, and OMO auto-update hardening remain Codex/OpenCode-owned upstream
behaviors. lfg continues to track the release baseline and install the
supported lfg-owned OMO port under `~/.grok`; manifest-only MCP entries are not behavior-adapted local MCP tools.

| upstream component | upstream source | local owner / tests | Grok/lfg support | Status |
|--------------------|-----------------|---------------------|------------------|--------|
| `comment-checker` | `packages/omo-codex/MARKETPLACE.md`; `components/comment-checker` | `src/grok-adapter/component-inventory.ts`; `plugin-cache-install.acceptance.test.ts` | Codex PostToolUse comment-checker behavior is not wired as a Grok-native post-edit workflow. | Deferred |
| `git-bash` | `packages/omo-codex/MARKETPLACE.md`; `components/git-bash` | `src/grok-adapter/component-inventory.ts`; `plugin-cache-install.acceptance.test.ts`; `materialize-grok-mcp.test.ts` | Manifest-only local MCP stub. macOS/non-Windows installs keep it disabled through `disabled_mcp_servers`; Windows behavior remains Windows-unverified until a real non-empty tools runtime is packaged and tested. | Manifest-only |
| `rules` | `packages/omo-codex/MARKETPLACE.md`; `components/rules` | `src/grok-adapter/rules-engine-vendored/` (vendored from `packages/rules-engine`); `src/grok-adapter/rules-injector.ts` (Grok PostToolUse glue); `hook-bridge.integration.test.ts`; `post-install-ported-hooks.test.ts` | **Native first-party OMO hooks** installed by Grok `lfg setup --run` (https://github.com/code-yeongyu/oh-my-openagent codex adapter + opencode). Bridge fallback (`lfg-grok-hook-bridge.mjs`) only for legacy/imported hooks. Phase 1 of the core/adapter port strategy: `rules-engine` is vendored verbatim (host-neutral) and wired into Grok via `rules-injector.ts` (PostToolUse → discover+match rules/AGENTS.md → context block). | Grok-adapted |
| `lsp` | `packages/omo-codex/MARKETPLACE.md`; `components/lsp` | `src/grok-adapter/component-inventory.ts`; `grok-adapter-parity-doc.test.ts`; `lfg-mcp manifest in post-install-verify`; `materialize-grok-mcp.test.ts` | LSP MCP is present in plugin-root .mcp.json with an lfg-owned local runtime stub. Behavior-level LSP tools are deferred until a real Grok-adapted runtime is packaged. | Manifest-only |
| `ast_grep` | upstream aggregate + build-bundled-mcp-runtimes | `src/grok-adapter/component-inventory.ts`; MCP manifest + doctor; `materialize-grok-mcp.test.ts` | ast_grep MCP is present in .mcp.json with an lfg-owned local runtime stub. `tools/list` is intentionally empty until a real Grok-adapted runtime is packaged. | Manifest-only |
| `codegraph` | `packages/utils/src/codegraph/`; `omo-codex/plugin/components/codegraph`; `omo-opencode/mcp/codegraph.ts` | `src/grok-adapter/component-inventory.ts`; `docs/grok-adapter-core-port-strategy.md` (Phase 0) | External `@colbymchenry/codegraph` semantic-code-graph MCP binary wrapped via host-neutral `utils/codegraph` provisioning (sha256-verified download to `~/.omo/codegraph`) + Grok-native `.mcp.json` command server (`serve --mcp`). Self-contained, parallel-safe; graph intelligence lives in the external binary, not OMO. | Grok-adapted |
| `grep_app` | upstream aggregate + remote MCP manifest | `src/grok-adapter/component-inventory.ts`; MCP manifest + doctor | grep_app MCP is represented as the upstream remote URL server `https://mcp.grep.app`; lfg validates manifest shape and does not live-call it by default. | Remote URL manifest-only |
| `context7` | upstream aggregate + remote MCP manifest | `src/grok-adapter/component-inventory.ts`; MCP manifest + doctor | context7 MCP is represented as the upstream remote URL server `https://mcp.context7.com/mcp`; lfg validates manifest shape and does not live-call it by default. | Remote URL manifest-only |
| `ultrawork` | `packages/omo-codex/MARKETPLACE.md`; `components/ultrawork` | `src/grok-adapter/sync-lazycodex-agents-to-grok.ts`; `sync-lazycodex-agents.test.ts` | **Native first-party OMO hooks** (Grok-first OMO parity via https://github.com/code-yeongyu/oh-my-openagent codex adapter + opencode feature). Ultrawork bridged only for legacy; agent prompts synced. | Grok-adapted |
| `ulw-loop` | `packages/omo-codex/MARKETPLACE.md`; `components/ulw-loop` | `src/grok-adapter/assets/lfg-config-loader.mjs`; `project-omo-ledger.test.ts`; `omo-loader-runtime.integration.test.ts` | Project `.omo` awareness is installed fail-closed through `lfg-config-loader.mjs`; `ulw-loop` session count + active ledger presence is now reported in hook context (SessionStart/UserPromptSubmit) when `.omo/ulw-loop/<session>/ledger.jsonl` exists. Full durable CLI execution remains owned by OMO. | Grok-adapted |
| `start-work-continuation` | `packages/omo-codex/MARKETPLACE.md`; `components/start-work-continuation` | `src/grok-adapter/component-inventory.ts`; `grok-adapter-parity-doc.test.ts` | Boulder/start-work continuation is not yet driven as a Grok-native lifecycle workflow. | Deferred |
| `prompts-core` | `packages/prompts-core/src/` (upstream `oh-my-openagent`) | `src/grok-adapter/prompts-core-vendored/`; `src/grok-adapter/grok-prompt-adapter.ts`; `prompts-core-vendored.test.ts` | Phase 3 of the core/adapter port strategy: prompts-core source (types, loader, variant-resolver, prompt tables for atlas/prometheus/ultrawork/mode) vendored; Grok glue resolves the default variant for Grok models via the fallback chain (docs/grok-adapter-core-port-strategy.md). | Grok-adapted |
| `agent-builder` | `omo-opencode/src/agents/*` + agent-builder foundation (upstream `oh-my-openagent`) | `src/grok-adapter/agent-builder-vendored/`; `src/grok-adapter/grok-agent-builder-adapter.ts`; `component-inventory.ts` | Phase 4 of the core/adapter port strategy: agent-builder foundation, dynamic-agent prompt builders, and curated builtin agent registry vendored; Grok glue assembles Grok agent roles. Partial port: 5/9 builtin agents fully ported; oracle/metis/sisyphus/hephaestus remain deferred as host-bound. | Grok-adapted |
| `delegate-core` | `packages/delegate-core/src/` (upstream `oh-my-openagent`) | `src/grok-adapter/delegate-core-vendored/`; `src/grok-adapter/grok-delegate-adapter.ts`; `component-inventory.ts` | Phase 5 of the core/adapter port strategy: delegate-core source (model-selection, retry-patterns, retry-guidance) vendored; Grok glue maps delegate-task model selection to Grok subagent routing (docs/grok-adapter-core-port-strategy.md). | Grok-adapted |
| `boulder-state` | `packages/boulder-state/src/` (upstream `oh-my-openagent`) | `src/grok-adapter/boulder-state-vendored/`; `src/grok-adapter/grok-delegate-adapter.ts`; `component-inventory.ts` | Phase 5 of the core/adapter port strategy: boulder-state source (plan-checklist, types, storage) vendored; Grok glue bridges plan-checklist to the `.omo/plans` convention (docs/grok-adapter-core-port-strategy.md). | Grok-adapted |
| `skills-loader-core` | `packages/skills-loader-core/src/` (upstream `oh-my-openagent`) | `src/grok-adapter/skills-loader-core-vendored/`; `src/grok-adapter/grok-skills-loader-adapter.ts`; `component-inventory.ts` | Phase 6 of the core/adapter port strategy: skills-loader-core host-neutral primitives (config, shared, builtin-skills loader) vendored; Grok glue discovers skills from Grok skill roots. Curated port: OpenCode-bound async discovery/runtime/tool/hooks layers and bundled SKILL.md content remain deferred. | Grok-adapted |
| `bootstrap` | upstream SessionStart component | `src/grok-adapter/component-inventory.ts`; `grok-adapter-parity-doc.test.ts` | Upstream bootstrap provisioning targets Codex runtime dependencies; lfg does not run provisioning hooks during Grok setup. | Deferred |
| `auto-update` | upstream SessionStart component | `src/grok-adapter/component-inventory.ts`; `grok-adapter-parity-doc.test.ts` | Upstream auto-update can run `npx lazycodex-ai@latest install`; lfg keeps updates user-controlled and does not enable this hook. | Unsupported |
| `telemetry` | `packages/omo-codex/MARKETPLACE.md`; `components/telemetry` | `src/grok-adapter/component-inventory.ts`; `plugin-cache-install.acceptance.test.ts` | lfg does not emit upstream anonymous telemetry. | Unsupported |

**Native first-party OMO hooks + bridge fallback only for legacy/imported hooks** per T11 of `.omo/plans/grok-native-omo-hooks.md`. Grok-first OMO parity via **codex adapter** core + **opencode** feature (https://github.com/code-yeongyu/oh-my-openagent).

## Hook Event Matrix

Upstream baseline: `/Users/ilseoblee/.config/opencode/node_modules/oh-my-openagent/packages/omo-codex/plugin/hooks/hooks.json` from `oh-my-openagent@4.10.0`. Local generated Grok hooks must either target an installed file under `~/.grok/plugins/lfg` or use the approved bridge command `hooks/lfg-grok-hook-bridge.mjs` with an installed child target. Telemetry stays disabled by default.

| Event | Upstream matcher | Upstream timeout | Upstream command | Local target decision | Local Grok behavior |
|---|---:|---:|---|---|---|
| `SessionStart` | none | 10s | `components/rules/dist/cli.js hook session-start` | Bridge to installed `components/rules/dist/cli.js` when present. | Grok-adapted rule loading plus lfg config loader and Sisyphus context. |
| `SessionStart` | none | 5s | `components/telemetry/dist/cli.js hook session-start` | Unsupported. | Not generated; lfg does not emit upstream telemetry by default. |
| `SessionStart` | `^startup$` | 5s | `scripts/auto-update.mjs hook session-start` | Unsupported. | Not generated; updates remain user-controlled. |
| `SessionStart` | none | 30s | `components/bootstrap/dist/cli.js hook session-start` | Deferred. | Not generated; lfg setup does not bootstrap Codex runtime dependencies from Grok hooks. |
| `UserPromptSubmit` | none | 10s | `components/rules/dist/cli.js hook user-prompt-submit` | Bridge to installed `components/rules/dist/cli.js` when present. | Grok-adapted rule refresh plus lfg config loader and Sisyphus intent routing. |
| `UserPromptSubmit` | none | 5s | `components/ultrawork/dist/cli.js hook user-prompt-submit` | Bridge to installed `components/ultrawork/dist/cli.js` when present. | Grok-adapted ultrawork trigger. |
| `UserPromptSubmit` | none | 10s | `components/ulw-loop/dist/cli.js hook user-prompt-submit` | Deferred. | Durable `.omo` awareness is supplied by `lfg-config-loader.mjs`; no uninstalled `ulw-loop` component command is generated. |
| `PreToolUse` | `^Bash$` | 5s | `components/git-bash/dist/cli.js hook pre-tool-use` | Deferred. | Not generated on macOS Grok installs. |
| `PreToolUse` | `^create_goal$` | 5s | `components/ulw-loop/dist/cli.js hook pre-tool-use` | Deferred. | Sisyphus native hook supplies pre-tool guidance; no uninstalled `ulw-loop` command is generated. |
| `PostToolUse` | edit/apply regex | 30s | `components/comment-checker/dist/cli.js hook post-tool-use` | Deferred. | Not generated until a Grok-native comment-checker component is packaged. |
| `PostToolUse` | edit/apply regex | 60s | `components/lsp/dist/cli.js hook post-tool-use` | Deferred. | Not generated until a Grok-native LSP component is packaged. |
| `PostToolUse` | `^apply_patch$` | 10s | `components/rules/dist/cli.js hook post-tool-use` | Bridge to installed `components/rules/dist/cli.js` when present. | Grok-adapted project-rule matching after patch edits. |
| `PostCompact` | `manual|auto` | 5s | `components/git-bash/dist/cli.js hook post-compact` | Deferred. | Not generated on macOS Grok installs. |
| `PostCompact` | `manual|auto` | 10s | `components/rules/dist/cli.js hook post-compact` | Bridge to installed `components/rules/dist/cli.js` when present. | Grok-adapted project-rule cache reset. |
| `PostCompact` | `manual|auto` | 5s | `components/lsp/dist/cli.js hook post-compact` | Deferred. | Not generated until a Grok-native LSP component is packaged. |
| `Stop` | none | 10s | `components/start-work-continuation/dist/cli.js hook stop` | Deferred. | Sisyphus native Stop hook supplies final-review context; start-work continuation CLI is not packaged. |
| `SubagentStop` | none | 10s | `components/start-work-continuation/dist/cli.js hook subagent-stop` | Deferred. | Sisyphus native SubagentStop hook supplies delegation-result context; start-work continuation CLI is not packaged. |

**Normative port map:** `docs/lfp-capability-port.md`  
**Ownership:** `docs/grok-adapter-ownership.md` (ADR; tested in `grok-adapter-ownership-doc.test.ts`)
