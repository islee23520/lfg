import type { ModelDiscovery } from "../models/lfg-models"
import type { CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import { installLfgGlobally, type LfgGlobalInstallResult } from "./lfg-global-install"

export type TuiGlobalInstaller = () => Promise<LfgGlobalInstallResult>

type TuiExecutePrompts = {
  readonly note: (message: string, title?: string) => void
  readonly outro: (message: string) => void
}

type TuiExecuteColors = {
  readonly green: (value: string) => string
}

export type ExecuteTuiInstallOptions = {
  readonly prompts: TuiExecutePrompts
  readonly colors: TuiExecuteColors
  readonly configuredForInstall: ModelDiscovery | null
  readonly codingToolAdapter: CodingToolAdapterId
  readonly configOnly: boolean
  readonly installGlobalCli: boolean
  readonly globalInstaller?: TuiGlobalInstaller
}

export async function executeTuiInstall(options: ExecuteTuiInstallOptions): Promise<Record<string, unknown>> {
  try {
    const { runLazycodexInstaller } = await import("./lfg-installer.js")
    const installRes: Record<string, unknown> = await runLazycodexInstaller(options.configuredForInstall, { codingToolAdapter: options.codingToolAdapter })
    writeOptionalOutput(installRes.stdout, process.stdout)
    writeOptionalOutput(installRes.stderr, process.stderr)

    const success = installRes.ok !== false
    const globalInstallOk = success && options.installGlobalCli
      ? await runGlobalInstall(options)
      : true
    const status = success
      ? options.configOnly
        ? "tui_config_saved"
        : globalInstallOk
          ? "tui_installed"
          : "tui_global_install_failed"
      : "tui_install_failed"

    const message = successMessage(options.configOnly, success, globalInstallOk)
    options.prompts.outro(success ? options.colors.green(message) : message)
    return { ok: success && globalInstallOk, status, executed: true }
  } catch (error) {
    options.prompts.outro("Install failed during execution. See errors above.")
    return { ok: false, status: "tui_error", error: error instanceof Error ? error.message : String(error), executed: false }
  }
}

async function runGlobalInstall(options: ExecuteTuiInstallOptions): Promise<boolean> {
  const globalRes = await (options.globalInstaller ?? installLfgGlobally)()
  writeOptionalOutput(globalRes.stdout, process.stdout)
  writeOptionalOutput(globalRes.stderr, process.stderr)
  options.prompts.note(
    globalRes.ok
      ? `Installed/updated global lfg CLI via: ${globalRes.command} ${globalRes.args.join(" ")}`
      : `Global lfg CLI install failed: ${globalRes.error ?? "unknown error"}`,
    "Global CLI",
  )
  return globalRes.ok
}

function successMessage(configOnly: boolean, success: boolean, globalInstallOk: boolean): string {
  if (!success) {
    return "Install completed with warnings. See output above. Re-run lfg --json setup --run to check."
  }
  if (configOnly) {
    return "LFG model routing saved under ~/.grok."
  }
  return globalInstallOk
    ? "Grok adapter installed under ~/.grok. Re-run lfg --json setup --run for scriptable verification."
    : "Grok adapter installed, but global lfg CLI install failed."
}

function writeOptionalOutput(value: unknown, stream: NodeJS.WritableStream): void {
  if (typeof value !== "string" || value.length === 0) {
    return
  }
  stream.write(value.endsWith("\n") ? value : `${value}\n`)
}
