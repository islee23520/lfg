# src/cli/setup

## OVERVIEW

Setup plan, installer wrapper, TUI/readline UX, and refresh paths that all funnel mutating work into `runGrokInstall`.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Installer wrapper | `lfg-installer.ts` | `runLazycodexInstaller` → `runGrokInstall` + `verifyGrokInstallSurface` + `installJson`. |
| Non-mutating plan | `setup-plan.ts` | `setupPlan()`, `refreshPlan()`, refresh executed JSON. |
| Clack TUI | `lfg-setup-tui.ts` + `lfg-setup-tui-*.ts` | Default on TTY; do not fall back to readline when TUI path applies. |
| Readline wizard | `lfg-interactive.ts` + `lfg-interactive-*.ts` | `--no-tui` / non-TTY only. |
| TUI execute path | `lfg-setup-tui-execute.ts` | Confirmed run → installer. |
| Adapter selection | `lfg-setup-tui-adapter*.ts` / related | Coding-tool adapter choice persists via runtime config. |

## CONVENTIONS

- Plan commands never write the plugin tree or `config.toml`.
- Mutating path is always `runLazycodexInstaller` (name is historical; Grok-only).
- Emit: interactive path owns human output; `--json` paths return structured objects only.
- Discovery/agent config may flow from models discovery; preserve user overrides over defaults.

## ANTI-PATTERNS

- Calling `writeGrokModelConfig` directly from setup UX (goes through `runGrokInstall` / refresh).
- Dumping installer JSON on bare interactive `setup`.
- Using TTY TUI path while still spawning the classic wizard.
- Treating `LAZYCODEX_INSTALLER_*` / `npx lazycodex-ai install` as the default Grok action.
