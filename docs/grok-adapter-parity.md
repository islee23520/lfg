# omo-codex → Grok parity (lfg owner)

Status column updated during `plans/lfg-omo-grok-adapter.md` execution.

| omo-codex capability | Codex reference | Grok owner (lfg) | Status |
|----------------------|-----------------|------------------|--------|
| Plugin cache install | `~/.codex/plugins/cache/sisyphuslabs/omo/` | `plugins/lfg/grok-install/` | partial (internal install + postInstallVerify) |
| `config.toml` merge | `install/config.mjs` | `grok-install` + `lfg-grok-config.ts` | partial (idempotent re-run test in `run-grok-install.test.ts`) |
| Agent TOML + preserve reasoning | `install/agents.mjs` | `grok-install/apply-agent-tomls.ts` | partial (merge existing TOML; preserve custom keys) |
| Hook trust | `install/hook-trust.mjs` | `grok-install/hook-trust.ts` | partial (validate hooks.json in postInstallVerify) |
| Install version stamp | `lazycodex-install.json` | `lfg-install.json` (Grok plugin root) | partial (stamp uses npm package version via `package-version.ts`) |
| `doctor` | `src/cli/doctor/checks/codex.ts` | `lfg doctor` | partial (cli + installSurface + pack smoke; → Implemented when registry 0.1.4+) |
| `cleanup` / `update` | passthrough CLI | `docs/grok-cleanup-update.md` | N/A (documented; re-run setup/doctor) |
| ulw-loop / start-work skills | plugin components | Grok plugin tree | partial (brownfield) |
| Project-local `.grok` repair | `project-local-cleanup.mjs` | `grok-install/project-local.ts` | partial (inspect only; repair documented N/A) |
| Model catalog | `model-catalog.json` | `lfg-models.ts` + `LAZYCODEX_*` | partial (`lfg-models.catalog.test.ts` env contract) |
| Autonomous permissions | `permissions.mjs` | N/A or Grok permissions | N/A |
| Telemetry | plugin telemetry | vendored in tree | partial |
| Extension hooks (LFP port) | legacy LFP | `grok-install/extension-hooks.ts` | partial (merge on install: visual-guidance + agent-reminder) |
| Extension agent overrides (LFP port) | legacy LFP | `extensions/agent-overrides` | partial (merge + ~/.grok/agents/*.toml) |

**Normative port map:** `docs/lfp-capability-port.md`  
**Ownership:** `docs/grok-adapter-ownership.md`