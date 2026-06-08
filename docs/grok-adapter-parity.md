# omo-codex → Grok parity (lfg owner)

Status column updated during `plans/lfg-omo-grok-adapter.md` execution.

| omo-codex capability | Codex reference | Grok owner (lfg) | Status |
|----------------------|-----------------|------------------|--------|
| Plugin cache install | `~/.codex/plugins/cache/sisyphuslabs/omo/` | `plugins/lfg/grok-install/` | partial (internal install + `postInstallVerify` canonical on setup JSON #21; idempotent internal install #27) |
| `config.toml` merge | `install/config.mjs` | `grok-install` + `lfg-grok-config.ts` | partial (single writer `runGrokInstall`; `LFG_OWNED_GROK_CONFIG_SECTIONS`; installer contract test #29) |
| Agent TOML + preserve reasoning | `install/agents.mjs` | `grok-install/apply-agent-tomls.ts` | partial (merge existing TOML; preserve custom keys) |
| Hook trust | `install/hook-trust.mjs` | `grok-install/hook-trust.ts` | partial (validate hooks.json in postInstallVerify; invalid hooks fail verify test #28) |
| Install version stamp | `lazycodex-install.json` | `lfg-install.json` (Grok plugin root) | partial (`platform: grok` + package version; `install.stamp.test.ts`) |
| `doctor` | `src/cli/doctor/checks/codex.ts` | `lfg doctor` | partial (checks[] + failedRequired; optional `publishGap` via `LFG_DOCTOR_REGISTRY_VERSION`; pack smoke) |
| `cleanup` / `update` | passthrough CLI | `docs/grok-cleanup-update.md` | N/A (documented; re-run setup/doctor) |
| ulw-loop / start-work skills | plugin components | Grok plugin tree | partial (brownfield) |
| Project-local `.grok` repair | `project-local-cleanup.mjs` | `grok-install/project-local.ts` | partial (`lfg --json project-local` inspect; repair N/A per docs) |
| Model catalog | `model-catalog.json` | `lfg-models.ts` + `LAZYCODEX_*` | partial (`lfg-models.catalog.test.ts` env contract) |
| Autonomous permissions | `permissions.mjs` | N/A or Grok permissions | N/A |
| Telemetry | plugin telemetry | vendored in tree | partial |
| Extension hooks (LFP port) | legacy LFP | `grok-install/extension-hooks.ts` | partial (merge on install; idempotent second merge test) |
| Extension agent overrides (LFP port) | legacy LFP | `grok-install/agent-overrides.ts` | partial (`mergeAgentTomlOverrides` + `apply-agent-tomls`; dedicated tests) |

**Normative port map:** `docs/lfp-capability-port.md`  
**Ownership:** `docs/grok-adapter-ownership.md`