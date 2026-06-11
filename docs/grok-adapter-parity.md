# omo-codex → Grok parity (lfg owner)

Status column updated during `plans/lfg-omo-grok-adapter.md` execution.

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

**Normative port map:** `docs/lfp-capability-port.md`  
**Ownership:** `docs/grok-adapter-ownership.md` (ADR; tested in `grok-adapter-ownership-doc.test.ts`)
