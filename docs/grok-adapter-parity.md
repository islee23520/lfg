# omo-codex → Grok parity (lfg owner)

Status column updated during `plans/lfg-omo-grok-adapter.md` execution.

Issue #36 separates the already-shipped **core install parity** from the larger
**full OMO component parity** surface. `lfg` remains a Grok setup helper, not a
Grok plugin/runtime: `setup --run` materializes the payload under
`~/.grok/installed-plugins/lfg`, writes `lfg-install.json`, and now writes a
versioned `lfg-component-inventory.json` so the installed component-support
matrix can be verified from a temp `HOME`.

## Core Install Parity

| omo-codex capability | Codex reference | Grok owner (lfg) | Status |
|----------------------|-----------------|------------------|--------|
| Plugin cache install | `~/.codex/plugins/cache/sisyphuslabs/omo/` | `plugins/lfg/grok-install/` | Implemented (`plugin-cache-install.acceptance.test.ts` #27; `setup-doctor-parity.test.ts` postInstallVerify #21) |
| `config.toml` merge | `install/config.mjs` | `grok-install` + `lfg-grok-config.ts` | Implemented (`config-single-writer.acceptance.test.ts` #29; `lfg-installer.contract.test.ts`; `lfg-grok-config.endpoints` #24; `grok-config-endpoints-doc.test.ts`; `docs/grok-config-endpoints.md`; `LFG_OWNED_GROK_CONFIG_SECTIONS`) |
| Agent TOML + preserve reasoning | `install/agents.mjs` | `grok-install/apply-agent-tomls.ts` | Implemented (`agent-tomls.acceptance.test.ts` #30; `apply-agent-tomls.test.ts`; `no-linalab-branding.test.ts`) |
| Hook trust | `install/hook-trust.mjs` | `grok-install/hook-trust.ts` | Implemented (`hook-trust.acceptance.test.ts` #28; `post-install-verify.test.ts`; internal verifier `hooksRegistered`) |
| Install version stamp | `lazycodex-install.json` | `lfg-install.json` (Grok plugin root) | Implemented (`plugin-cache-install.acceptance.test.ts` #27; `npm-publish-root-contract.test.ts` #22; `publish-gap-evidence-shape.test.ts`) |
| Internal verifier | `src/cli/doctor/checks/codex.ts` | `grok-install/doctor.ts` (not public CLI) | Implemented (`doctor-pack-layout.acceptance.test.ts` #25; `doctor-json-contract.test.ts` #31; `setup-doctor-parity.test.ts` #21; `publish-owner-checklist.test.ts`; `registry-bin-publish-gap.test.ts`; `publishGap` #22) |
| `cleanup` / `update` | passthrough CLI | `docs/grok-cleanup-update.md` | N/A (`grok-cleanup-update-doc.test.ts` #34; re-run `setup --run`) |
| ulw-loop / start-work skills | plugin components + project `.omo` ledger | Grok plugin tree + `grok-install/assets/lfg-config-loader.mjs` | Implemented for lfg-owned hook-time project `.omo` awareness (`project-omo-ledger.test.ts`; `lfg-config-loader.test.ts`; `omo-loader-runtime.integration.test.ts`): concise active work/status/plan/worktree plus ledger existence and line count only; no ledger tail/content; malformed `.omo` fails closed. Upstream components remain vendored/brownfield. |
| Project-local `.grok` repair | `project-local-cleanup.mjs` | `grok-install/project-local.ts` | N/A (internal inspect helper; public CLI remains setup-only; automated repair deferred — `repair` field in JSON; `lfg-project-local.test.ts` #28) |
| Model catalog | `model-catalog.json` | `lfg-models.ts` + `LAZYCODEX_*` | Implemented (`lfg-models.mapping.test.ts`; `lfg-models.urls.test.ts`; setup discovery env) |
| Autonomous permissions | `permissions.mjs` | N/A or Grok permissions | N/A |
| Telemetry | plugin telemetry | vendored in tree | N/A (upstream plugin telemetry; lfg does not emit) |
| Extension hooks (LFP port) | legacy LFP | `grok-install/extension-hooks.ts` | Implemented (`post-install-ported-hooks.test.ts` #32; `extension-hooks.test.ts`; `extension-hooks.catalog.test.ts`; `hook-trust`) |
| Extension agent overrides (LFP port) | legacy LFP | `grok-install/agent-overrides.ts` | Implemented (`agent-overrides.test.ts` #30; `apply-agent-tomls.ts` merge) |
| Per-agent model overrides (LFP-style) | LFP `omo-agent-model-overrides` + `agent-config` | `lazycodex-agent-overrides.ts` + `sync-lazycodex-agents-to-grok.ts` | Implemented (`lazycodex-agent-overrides.test.ts`; `~/.grok/lazycodex-agent-overrides.json`; interactive setup) |

## Full OMO Component Parity

Upstream component inventory is from
`oh-my-openagent/packages/omo-codex/MARKETPLACE.md` at
`96ad1974c5102e962c67d11d59852e4d9b2a174d`. Each row cites the upstream source
plus the local owner/test surface. The status vocabulary for this table is:
`Implemented`, `Grok-adapted`, `Unsupported`, or `Deferred`.

| upstream component | upstream source | local owner / tests | Grok/lfg support | Status |
|--------------------|-----------------|---------------------|------------------|--------|
| `comment-checker` | `packages/omo-codex/MARKETPLACE.md`; `components/comment-checker` | `plugins/lfg/grok-install/component-inventory.ts`; `plugin-cache-install.acceptance.test.ts` | Codex PostToolUse comment-checker behavior is not wired as a Grok-native post-edit workflow. | Deferred |
| `git-bash` | `packages/omo-codex/MARKETPLACE.md`; `components/git-bash` | `plugins/lfg/grok-install/component-inventory.ts`; `plugin-cache-install.acceptance.test.ts` | Windows Git Bash MCP is Codex-host specific and outside the Grok setup-helper contract. | Unsupported |
| `rules` | `packages/omo-codex/MARKETPLACE.md`; `components/rules` | `plugins/lfg/grok-install/normalize-plugin-hooks.ts`; `hook-bridge.integration.test.ts`; `post-install-ported-hooks.test.ts` | Component lifecycle hook commands are ported through `lfg-grok-hook-bridge.mjs` when the installed payload contains them. | Grok-adapted |
| `lsp` | `packages/omo-codex/MARKETPLACE.md`; `components/lsp` | `plugins/lfg/grok-install/component-inventory.ts`; `grok-adapter-parity-doc.test.ts` | OMO LSP MCP tools are not exposed by the setup-only Grok adapter package. | Deferred |
| `ultrawork` | `packages/omo-codex/MARKETPLACE.md`; `components/ultrawork` | `plugins/lfg/grok-install/sync-lazycodex-agents-to-grok.ts`; `sync-lazycodex-agents.test.ts` | Ultrawork hook commands are bridged when present, and component agent prompts are synced into Grok role/persona/prompt files. | Grok-adapted |
| `ulw-loop` | `packages/omo-codex/MARKETPLACE.md`; `components/ulw-loop` | `plugins/lfg/grok-install/assets/lfg-config-loader.mjs`; `project-omo-ledger.test.ts`; `omo-loader-runtime.integration.test.ts` | Project `.omo` awareness is installed fail-closed through `lfg-config-loader.mjs`; full durable CLI execution remains owned by OMO. | Grok-adapted |
| `start-work-continuation` | `packages/omo-codex/MARKETPLACE.md`; `components/start-work-continuation` | `plugins/lfg/grok-install/component-inventory.ts`; `grok-adapter-parity-doc.test.ts` | Boulder/start-work continuation is not yet driven as a Grok-native lifecycle workflow. | Deferred |
| `telemetry` | `packages/omo-codex/MARKETPLACE.md`; `components/telemetry` | `plugins/lfg/grok-install/component-inventory.ts`; `plugin-cache-install.acceptance.test.ts` | lfg does not emit upstream anonymous telemetry. | Unsupported |

**Normative port map:** `docs/lfp-capability-port.md`  
**Ownership:** `docs/grok-adapter-ownership.md` (ADR; tested in `grok-adapter-ownership-doc.test.ts`)
