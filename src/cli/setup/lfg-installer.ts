import type { JsonObject } from "../../shared/json"
import type { ModelDiscovery } from "../models/lfg-models"
import { defaultLazycodexAgentConfig, modelDiscoveryEnv } from "../models/lfg-models"
import {
  configFieldsFromRun,
  grokInstallStepJson,
  INTERNAL_GROK_INSTALL_COMMAND,
  INTERNAL_GROK_INSTALL_PACKAGE,
  runGrokInstall,
  type GrokInstallRunOptions,
} from "../../grok/install/run-grok-install"
import { verifyGrokInstallSurface } from "../../grok/doctor/post-install-verify"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"

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
  readonly installOnly?: boolean
}

/** Grok-first setup: materialize lazycodex under ~/.grok via internal grok-install (no Codex npx). */
export async function runLazycodexInstaller(
  discovery: ModelDiscovery | null = null,
  options: LazycodexInstallerOptions = {},
): Promise<JsonObject> {
  const agentConfig = discovery?.agentConfig ?? null
  const env = mergeStringEnv(process.env, modelDiscoveryEnv(discovery, agentConfig))
  const grokOptions: GrokInstallRunOptions = {
    ...(options.force === undefined ? {} : { force: options.force }),
    ...(options.installOnly === undefined ? {} : { installOnly: options.installOnly }),
    ...(discovery?.agentOverrideMap === undefined ? {} : { fullAgentModels: discovery.agentOverrideMap }),
  }
  const grokRun = await runGrokInstall(discovery, env, grokOptions)
  const internalResult = grokInstallStepJson(grokRun.internalStep) as InstallerStepResult
  const ok = grokRun.ok
  const home = resolveGrokSetupHome(env)
  const postInstallVerify = await verifyGrokInstallSurface({ home })
  const agentPaths = grokRun.omoAgents?.written ?? grokRun.lazycodexAgents?.written ?? []
  const agentOverridesPath = grokRun.agentOverridesPath ?? null
  const lfgConfigPath = grokRun.lfgConfigPath ?? null
  const hooks = grokRun.hooks ?? null
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
    hooks,
    installPath: "grok",
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
    role: "omo_grok_installer",
    adapterPackage: INTERNAL_GROK_INSTALL_PACKAGE,
    companionPackage: INTERNAL_GROK_INSTALL_PACKAGE,
    lfgIsPlugin: false,
    installerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    installerArgs: [],
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerArgs: [],
    installers,
    exitCode: failedExit,
    stdout: installers.map((installer) => installer.stdout).filter((value) => value.length > 0).join("\n"),
    stderr: installers.map((installer) => installer.stderr).filter((value) => value.length > 0).join("\n"),
    ...(discovery === null ? {} : { modelDiscovery: discovery, agentReasoning: agentReasoningSummary(discovery) }),
    ...rest,
  }
}

function agentReasoningSummary(discovery: ModelDiscovery): JsonObject {
  const agents = discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  return Object.fromEntries(Object.entries(agents).map(([name, setting]) => [name, setting.reasoningLevel]))
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
