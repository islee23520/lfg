# omo-codex → Grok parity (lfg owner)

Status column updated during `plans/lfg-omo-grok-adapter.md` execution.

| omo-codex capability | Codex reference | Grok owner (lfg) | Status |
|----------------------|-----------------|------------------|--------|
| Plugin cache install | `~/.codex/plugins/cache/sisyphuslabs/omo/` | `plugins/lfg/grok-install/` | Implemented (`plugin-cache-install.acceptance.test.ts` #27; `setup-doctor-parity.test.ts` postInstallVerify #21) |
| `config.toml` merge | `install/config.mjs` | `grok-install` + `lfg-grok-config.ts` | partial (`config-single-writer.acceptance.test.ts` #29; `lfg-grok-config.endpoints` #24) |
| Agent TOML + preserve reasoning | `install/agents.mjs` | `grok-install/apply-agent-tomls.ts` | partial (`agent-tomls.acceptance.test.ts` #30; `apply-agent-tomls` preserve custom keys) |
| Hook trust | `install/hook-trust.mjs` | `grok-install/hook-trust.ts` | Implemented (`hook-trust.acceptance.test.ts` #28; `post-install-verify.test.ts`; doctor `hooksRegistered`) |
| Install version stamp | `lazycodex-install.json` | `lfg-install.json` (Grok plugin root) | Implemented (`plugin-cache-install.acceptance.test.ts` #27; `npm-publish-root-contract.test.ts` #22; `publish-gap-evidence-shape.test.ts`) |
| `doctor` | `src/cli/doctor/checks/codex.ts` | `lfg doctor` | Implemented (`doctor-pack-layout.acceptance.test.ts` #25; `doctor-json-contract.test.ts` #31; `setup-doctor-parity.test.ts` #21; `publish-owner-checklist.test.ts`; `registry-bin-publish-gap.test.ts`; `publishGap` #22) |
| `cleanup` / `update` | passthrough CLI | `docs/grok-cleanup-update.md` | N/A (`grok-cleanup-update-doc.test.ts`; re-run setup/doctor) |
| ulw-loop / start-work skills | plugin components | Grok plugin tree | partial (brownfield) |
| Project-local `.grok` repair | `project-local-cleanup.mjs` | `grok-install/project-local.ts` | N/A (`lfg project-local` inspect; automated repair deferred — `repair` field in JSON; `lfg-project-local.test.ts` #28) |
| Model catalog | `model-catalog.json` | `lfg-models.ts` + `LAZYCODEX_*` | partial (env contract + `lfg-models.mapping.test.ts` role mapping) |
| Autonomous permissions | `permissions.mjs` | N/A or Grok permissions | N/A |
| Telemetry | plugin telemetry | vendored in tree | partial |
| Extension hooks (LFP port) | legacy LFP | `grok-install/extension-hooks.ts` | partial (`post-install-ported-hooks.test.ts` #32; `extension-hooks` idempotent merge) |
| Extension agent overrides (LFP port) | legacy LFP | `grok-install/agent-overrides.ts` | partial (`mergeAgentTomlOverrides` + `apply-agent-tomls`; dedicated tests) |

**Normative port map:** `docs/lfp-capability-port.md`  
**Ownership:** `docs/grok-adapter-ownership.md` (ADR; tested in `grok-adapter-ownership-doc.test.ts`)