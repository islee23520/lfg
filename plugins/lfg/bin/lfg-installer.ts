import type { JsonObject } from "./lfg-json"
import type { ModelDiscovery } from "./lfg-models"
import { modelDiscoveryEnv } from "./lfg-models"
import {
  configFieldsFromRun,
  grokInstallStepJson,
  INTERNAL_GROK_INSTALL_COMMAND,
  INTERNAL_GROK_INSTALL_PACKAGE,
  runGrokInstall,
} from "../grok-install/run-grok-install"
import { verifyGrokInstallSurface } from "../grok-install/post-install-verify"

/** Legacy Codex installer; not run on default Grok setup path. */
export const LAZYCODEX_INSTALLER_ARGS = ["lazycodex-ai", "install"] as const
export const LAZYCODEX_INSTALLER_COMMAND = "npx lazycodex-ai install"

export const LFP_INSTALLER_ARGS = [] as const
export const LFP_INSTALLER_COMMAND = INTERNAL_GROK_INSTALL_COMMAND

type InstallerStepResult = {
  readonly packageName: string
  readonly command: string
  readonly args: readonly string[]
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type LazycodexInstallerOptions = {
  readonly force?: boolean
}

/** Grok-first setup: materialize lazycodex under ~/.grok via internal grok-install (no Codex npx). */
export async function runLazycodexInstaller(
  discovery: ModelDiscovery | null = null,
  options: LazycodexInstallerOptions = {},
): Promise<JsonObject> {
  const agentConfig = discovery?.agentConfig ?? null
  const env = mergeStringEnv(process.env, modelDiscoveryEnv(discovery, agentConfig))
  const grokRun = await runGrokInstall(discovery, env, { force: options.force })
  const internalResult = grokInstallStepJson(grokRun.internalStep) as InstallerStepResult
  const ok = grokRun.ok
  const home = env.HOME ?? process.env.HOME ?? ""
  const postInstallVerify = home.length > 0 ? await verifyGrokInstallSurface({ home }) : { status: "missing_adapter", ok: false }
  const agentPaths = grokRun.lazycodexAgents?.written ?? []
  const agentOverridesPath = grokRun.agentOverridesPath ?? null
  const lfgConfigPath = grokRun.lfgConfigPath ?? null
  return installJson({
    ok,
    status: ok ? "installed" : "install_failed",
    discovery,
    installers: [internalResult],
    failedExit: ok ? 0 : internalResult.exitCode,
    ...configFieldsFromRun(grokRun.configUpdate),
    internalStep: internalResult,
    postInstallVerify,
    agentPaths,
    agentTomlPaths: agentPaths,
    agentOverridesPath,
    lfgConfigPath,
    installPath: "grok",
    skippedCodexInstaller: true,
    preservedExistingSetup: grokRun.internalStep.skippedExistingSetup === true,
  })
}

function installJson(fields: {
  readonly ok: boolean
  readonly status: string
  readonly discovery: ModelDiscovery | null
  readonly installers: readonly InstallerStepResult[]
  readonly failedExit: number
} & JsonObject): JsonObject {
  const { ok, status, discovery, installers, failedExit, ...rest } = fields
  return {
    ok,
    status,
    command: "setup",
    executed: true,
    role: "lazycodex_adapter_installer",
    adapterPackage: INTERNAL_GROK_INSTALL_PACKAGE,
    companionPackage: INTERNAL_GROK_INSTALL_PACKAGE,
    installerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    installerArgs: [],
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerArgs: [],
    legacyCodexInstallerCommand: LAZYCODEX_INSTALLER_COMMAND,
    installers,
    exitCode: failedExit,
    stdout: installers.map((installer) => installer.stdout).filter((value) => value.length > 0).join("\n"),
    stderr: installers.map((installer) => installer.stderr).filter((value) => value.length > 0).join("\n"),
    lfgIsPlugin: false,
    ...(discovery === null ? {} : { modelDiscovery: discovery }),
    ...rest,
  }
}

function mergeStringEnv(base: NodeJS.ProcessEnv, extra: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === "string") {
      out[key] = value
    }
  }
  return { ...out, ...extra }
}
