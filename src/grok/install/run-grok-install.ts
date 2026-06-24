import type { JsonObject } from "../../shared/json"
import { grokConfigJson, writeGrokModelConfig } from "../../cli/config/lfg-grok-config"
import type { ModelDiscovery, SetupPreset } from "../../cli/models/lfg-models"
import { modelDiscoveryEnv } from "../../cli/models/lfg-models"
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled, ensureLfgSubagentModels } from "./grok-plugins-enable"
import { ensureLfgConfigFiles } from "../config/lfg-config"
import {
  resolveLazycodexAgentOverrides,
  writeOmoAgentOverridesFile,
} from "../agents/lazycodex-agent-overrides"
import { resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config"
import { resolveGrokAdapterPluginRoot } from "../payload/grok-adapter-paths"
import { overlayLfgComponentShims } from "../payload/install"
import { runInternalGrokInstall } from "./run-internal"
import { syncLazycodexAgentsToGrokLedger, type SyncLazycodexAgentsResult } from "../agents/sync-lazycodex-agents-to-grok"
import { componentInventoryPath } from "../payload/component-inventory"
import { applyRecommendationsToOverrideMap } from "../models/model-recommendation-availability"
import { resolveGrokApiKey } from "./grok-api-key"
import { resolveGrokSetupHome } from "./grok-home"
import { resolveExistingStampedLfgSetup } from "./run-grok-install-existing"
import { syncPostInstallPluginPayload, type PostInstallPluginSyncResult } from "./run-grok-install-post-sync"

export const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install" as const
export const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install" as const

export type GrokInstallRunResult = {
  readonly ok: boolean
  readonly configUpdate: Awaited<ReturnType<typeof writeGrokModelConfig>> | null
  readonly internalStep: JsonObject
  readonly omoAgents: SyncLazycodexAgentsResult | null
  readonly lazycodexAgents: SyncLazycodexAgentsResult | null
  readonly agentOverridesPath: string | null
  readonly lfgConfigPath: string | null
  readonly pluginsEnabled: Awaited<ReturnType<typeof ensureLfgPluginsEnabled>> | null
  readonly subagentModels: Awaited<ReturnType<typeof ensureLfgSubagentModels>> | null
  /** Hooks are always (re)normalized on every setup so the bridge, config loader, and ultrawork hooks are guaranteed loaded. */
  readonly hooks: PostInstallPluginSyncResult | null
}

export type GrokInstallRunOptions = {
  readonly force?: boolean
  readonly fullAgentModels?: Readonly<Record<string, { model: string; reasoningLevel: string }>>
  readonly installOnly?: boolean
}

type SubagentModelMapping = NonNullable<Parameters<typeof ensureLfgSubagentModels>[1]>

/** Single transaction: internal plugin sync then optional config.toml merge (lfg-owned sections). */
export async function runGrokInstall(
  discovery: ModelDiscovery | null,
  env: NodeJS.ProcessEnv = process.env,
  options: GrokInstallRunOptions = {},
): Promise<GrokInstallRunResult> {
  const home = resolveGrokSetupHome(env)
  const homeEnv = { ...env, HOME: home }
  const apiKey = await resolveGrokApiKey(homeEnv)
  if (options.installOnly === true) {
    const internalEnv = {
      ...homeEnv,
      LFG_SETUP_FORCE: "1",
    }
    const internalStep = await runInternalGrokInstall(internalEnv)
    const pluginRootAfterInstall = (await resolveGrokAdapterPluginRoot(home))?.pluginRoot
    let hooksFresh: PostInstallPluginSyncResult | null = null
    if (pluginRootAfterInstall) {
      hooksFresh = await syncPostInstallPluginPayload(pluginRootAfterInstall)
    }
    return {
      ok: internalStep.ok === true,
      configUpdate: null,
      internalStep: { ...internalStep, installOnly: true },
      omoAgents: null,
      lazycodexAgents: null,
      agentOverridesPath: null,
      lfgConfigPath: null,
      pluginsEnabled: null,
      subagentModels: null,
      hooks: hooksFresh,
    }
  }
  const existingSetup = options.force === true ? null : await resolveExistingStampedLfgSetup(home)
  if (existingSetup !== null) {
    const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery)
    const agentOverrideMap = discovery?.agentOverrideMap
    const overrideMap = agentOverrideMap !== undefined
      ? agentOverrideMap
      : applyRecommendationsToOverrideMap(
          await resolveLazycodexAgentOverrides(home, resolvedAgents),
          discovery?.modelIds ?? [],
          recommendationPreset(discovery?.preset),
        )
    const fullAgentModels = options.fullAgentModels ?? overrideMap
    const configUpdate =
      discovery !== null
        ? await writeGrokModelConfig(discovery, {
            apiKey,
            home,
            agentConfig: resolvedAgents,
            fullAgentModels,
          })
        : null
    const overridesPath = await writeOmoAgentOverridesFile(home, overrideMap)
    const configFiles = await ensureLfgConfigFiles(home, overrideMap)
    const omoAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap)
    const pluginsEnabled = await ensureLfgPluginsEnabled(home)
    await ensureLfgAgentsPreferred(home)
    const subagentModels = await ensureLfgSubagentModels(
      home,
      subagentModelMappingFromDiscovery(discovery, resolvedAgents),
    )

    // Hooks must always be (re)normalized on every setup run so the Grok bridge,
    // lfg-config-loader, project omo ledger, and ultrawork component hooks are guaranteed loaded.
    // Component shims are also re-overlaid to repair upstream CLIs that crash on missing
    // package imports (e.g. @code-yeongyu/lsp-daemon in the upstream lsp component).
    await overlayLfgComponentShims(existingSetup.pluginRoot)
    const hooksNormalized = await syncPostInstallPluginPayload(existingSetup.pluginRoot)

    return {
      ok: true,
      configUpdate,
      internalStep: {
        ok: true,
        status: "already_installed",
        step: "internal_grok_install",
        packageName: INTERNAL_GROK_INSTALL_PACKAGE,
        mode: "preserve_existing_setup",
        skippedExistingSetup: true,
        componentInventoryPath: componentInventoryPath(existingSetup.pluginRoot),
        exitCode: 0,
        stdout:
          configUpdate === null
            ? "existing Grok lfg setup preserved; pass --force to overwrite lfg-owned setup"
            : "existing Grok lfg setup preserved; synced model config from discovered CLI proxy models",
        stderr: "",
      },
      omoAgents,
      lazycodexAgents: omoAgents,
      agentOverridesPath: overridesPath,
      lfgConfigPath: configFiles.configPath,
      pluginsEnabled,
      subagentModels,
      hooks: hooksNormalized,
    }
  }
  const agentConfig = discovery?.agentConfig ?? null
  const internalEnv = {
    ...homeEnv,
    ...modelDiscoveryEnv(discovery, agentConfig),
    ...(options.force === true ? { LFG_SETUP_FORCE: "1" } : {}),
  }
  const internalStep = await runInternalGrokInstall(internalEnv)
  const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery)
  const agentOverrideMap = discovery?.agentOverrideMap
  const overrideMap = agentOverrideMap !== undefined
    ? agentOverrideMap
    : applyRecommendationsToOverrideMap(
        await resolveLazycodexAgentOverrides(home, resolvedAgents),
        discovery?.modelIds ?? [],
        recommendationPreset(discovery?.preset),
      )
  const fullAgentModels = options.fullAgentModels ?? overrideMap
  const configUpdate =
    discovery !== null
      ? await writeGrokModelConfig(discovery, {
          apiKey,
          home,
          agentConfig: resolvedAgents,
          fullAgentModels,
        })
      : null
  const overridesPath = await writeOmoAgentOverridesFile(home, overrideMap)
  const configFiles = await ensureLfgConfigFiles(home, overrideMap)
  const omoAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap)
  const pluginsEnabled = await ensureLfgPluginsEnabled(home)
  await ensureLfgAgentsPreferred(home)
  const subagentModels = await ensureLfgSubagentModels(
    home,
    subagentModelMappingFromDiscovery(discovery, resolvedAgents),
  )

  // Always (re)normalize hooks on every install path (fresh or repair), so the Grok bridge,
  // lfg-config-loader, project omo ledger, and ultrawork component hooks are guaranteed present.
  const pluginRootAfterInstall = (await resolveGrokAdapterPluginRoot(home))?.pluginRoot
  let hooksFresh: PostInstallPluginSyncResult | null = null
  if (pluginRootAfterInstall) {
    hooksFresh = await syncPostInstallPluginPayload(pluginRootAfterInstall)
  }

  return {
    ok: internalStep.ok === true,
    configUpdate,
    internalStep,
    omoAgents,
    lazycodexAgents: omoAgents,
    agentOverridesPath: overridesPath,
    lfgConfigPath: configFiles.configPath,
    pluginsEnabled,
    subagentModels,
    hooks: hooksFresh,
  }
}

function recommendationPreset(preset: SetupPreset | undefined): "grok" | "gpt" | undefined {
  return preset === "gpt" ? "gpt" : preset === undefined ? undefined : "grok"
}

function subagentModelMappingFromDiscovery(
  discovery: ModelDiscovery | null,
  resolvedAgents: Awaited<ReturnType<typeof resolveGlobalLazycodexAgentConfig>>,
): SubagentModelMapping {
  const explorerModel = resolvedAgents.explorer?.model ?? discovery?.mapping.fast ?? "grok-3-mini-fast"
  const fastRoute = explorerModel
  return {
    default: discovery?.mapping.default ?? explorerModel,
    fast: fastRoute,
    reasoning: resolvedAgents.reasoning?.model ?? discovery?.mapping.reasoning ?? "grok-4.20-0309-reasoning",
    coding: resolvedAgents.coding?.model ?? discovery?.mapping.coding ?? "grok-4.20-0309-non-reasoning",
    fastReasoning: resolvedAgents.explorer?.reasoningLevel ?? "low",
    reasoningReasoning: resolvedAgents.reasoning?.reasoningLevel ?? "high",
    codingReasoning: resolvedAgents.coding?.reasoningLevel ?? "medium",
  }
}

export function grokInstallStepJson(internalStep: JsonObject): JsonObject {
  const base = {
    packageName: INTERNAL_GROK_INSTALL_PACKAGE,
    command: INTERNAL_GROK_INSTALL_COMMAND,
    args: [] as const,
    exitCode: typeof internalStep.exitCode === "number" ? internalStep.exitCode : 1,
    stdout: typeof internalStep.stdout === "string" ? internalStep.stdout : "",
    stderr: typeof internalStep.stderr === "string" ? internalStep.stderr : "",
    ...(typeof internalStep.componentInventoryPath === "string"
      ? { componentInventoryPath: internalStep.componentInventoryPath }
      : {}),
    ...(internalStep.installOnly === true ? { installOnly: true } : {}),
  }
  if (typeof internalStep.warning === "string" && internalStep.warning.length > 0) {
    return { ...base, warning: internalStep.warning }
  }
  return base
}

export function configFieldsFromRun(configUpdate: GrokInstallRunResult["configUpdate"]): JsonObject {
  if (configUpdate === null) {
    return {}
  }
  return {
    configUpdated: true,
    configPath: configUpdate.path,
    modelsBaseUrl: configUpdate.modelsBaseUrl,
    grokConfig: grokConfigJson(configUpdate),
  }
}
