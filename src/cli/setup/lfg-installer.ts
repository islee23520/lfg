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
import { purgeInvalidModelSettingsJson } from "../../grok/config/purge-invalid-model-settings"
import { codingToolAdapterSelectionJson, DEFAULT_CODING_TOOL_ADAPTER, type CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import { cliBackendSelectionJson, DEFAULT_CLI_BACKEND, type BackendRoutingConfig, type CliBackend } from "../../core/lfg/backend-routing"
import { readBackendRoutingConfig } from "../config/lfg-grok-config"
import { probeCodexLazyCodexPrereqs, prereqReportJson, type PrereqReport } from "../../core/lfg/prereqs/codex-lazycodex"
import { slimNativeAgentOverrides, type LazycodexAgentOverrideMap } from "../../grok/agents/lazycodex-agent-overrides"

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
  readonly codingToolAdapter?: CodingToolAdapterId
  readonly backendEngine?: CliBackend
  readonly backendRouting?: BackendRoutingConfig
  readonly prereqProbe?: () => Promise<PrereqReport>
}

/** Grok-first setup: materialize lfg/OMO adapter under ~/.grok via internal grok-install (no Codex npx). */
export async function runLazycodexInstaller(
  discovery: ModelDiscovery | null = null,
  options: LazycodexInstallerOptions = {},
): Promise<JsonObject> {
  const agentConfig = discovery?.agentConfig ?? null
  const env = mergeStringEnv(process.env, modelDiscoveryEnv(discovery, agentConfig))
  const home = resolveGrokSetupHome(env)
  const prereqs = options.prereqProbe === undefined
    ? await probeCodexLazyCodexPrereqs({ env, home })
    : await options.prereqProbe()
  if (!prereqs.codex.ok) {
    return {
      ok: false,
      status: "codex_required",
      command: "setup",
      executed: false,
      exitCode: 2,
      error: "Codex CLI is required before lfg setup can modify Grok.",
      prereqs: prereqReportJson(prereqs),
      lfgIsPlugin: false,
    }
  }
  // coding_tool_adapter is always grok; settings live in ~/.grok/config.toml only.
  const codingToolAdapter = options.codingToolAdapter ?? DEFAULT_CODING_TOOL_ADAPTER
  const backendEngine = options.backendEngine ?? DEFAULT_CLI_BACKEND
  const storedBackendRouting = await readBackendRoutingConfig(home)
  const backendRouting = options.backendRouting ?? (
    options.backendEngine === undefined
      ? storedBackendRouting
      : { ...storedBackendRouting, global: backendEngine }
  )
  const grokOptions: GrokInstallRunOptions = {
    ...(options.force === undefined ? {} : { force: options.force }),
    ...(options.installOnly === undefined ? {} : { installOnly: options.installOnly }),
    codingToolAdapter,
    backendEngine,
    backendRouting,
    ...(discovery?.agentOverrideMap === undefined ? {} : { fullAgentModels: discovery.agentOverrideMap }),
  }
  const grokRun = await runGrokInstall(discovery, env, grokOptions)
  const internalResult = grokInstallStepJson(grokRun.internalStep) as InstallerStepResult
  const ok = grokRun.ok
  const postInstallVerify = await verifyGrokInstallSurface({ home })
  const agentPaths = grokRun.omoAgents?.written ?? []
  const agentOverridesPath = grokRun.agentOverridesPath ?? null
  const lfgConfigPath = grokRun.lfgConfigPath ?? null
  const hooks = grokRun.hooks ?? null
  const invalidModelSettings =
    grokRun.invalidModelSettings === null ? null : purgeInvalidModelSettingsJson(grokRun.invalidModelSettings)
  const xaiMcp = grokRun.xaiMcp
  return installJson({
    ok,
    status: ok ? "installed" : "install_failed",
    discovery,
    installers: [internalResult],
    failedExit: ok ? 0 : internalResult.exitCode,
    ...configFieldsFromRun(grokRun.configUpdate),
    internalStep: internalResult,
    postInstallVerify,
    codingToolAdapter: codingToolAdapterSelectionJson(codingToolAdapter),
    backendEngine: cliBackendSelectionJson(backendEngine),
    backendRouting,
    agentPaths,
    agentTomlPaths: agentPaths,
    agentOverridesPath,
    lfgConfigPath,
    hooks,
    ...(invalidModelSettings === null ? {} : { invalidModelSettings }),
    ...(xaiMcp === null
      ? {}
      : {
          xaiMcp: {
            ok: xaiMcp.ok,
            status: xaiMcp.status,
            changed: xaiMcp.changed,
            configPath: xaiMcp.configPath,
            runtimeCli: xaiMcp.runtimeCli,
            message: xaiMcp.message,
          },
        }),
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
    ...(discovery === null ? {} : { modelDiscovery: slimModelDiscovery(discovery), agentReasoning: agentReasoningSummary(discovery) }),
    ...rest,
  }
}

function agentReasoningSummary(discovery: ModelDiscovery): JsonObject {
  const agents = discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const overrides = slimNativeAgentOverrides(discovery.agentOverrideMap ?? roleConfigAsOverrides(agents))
  return Object.fromEntries(Object.entries(overrides).map(([name, setting]) => [name, setting.reasoningLevel]))
}

function slimModelDiscovery(discovery: ModelDiscovery): ModelDiscovery {
  if (discovery.agentOverrideMap === undefined) return discovery
  return { ...discovery, agentOverrideMap: slimNativeAgentOverrides(discovery.agentOverrideMap) }
}

function roleConfigAsOverrides(agents: NonNullable<ModelDiscovery["agentConfig"]>): LazycodexAgentOverrideMap {
  return {
    default: agents.reasoning,
    coding: agents.coding,
    explorer: agents.explorer,
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
