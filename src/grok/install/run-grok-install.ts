import type { JsonObject } from "../../shared/json"
import { grokConfigJson, writeGrokModelConfig } from "../../cli/config/lfg-grok-config"
import type { ModelDiscovery } from "../../cli/models/lfg-models"
import { modelDiscoveryEnv } from "../../cli/models/lfg-models"
import { grokRoutedOverrideMap } from "../../cli/models/resolve-tier-model"
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled, ensureLfgSubagentModels } from "./grok-plugins-enable"
import { ensureGrokBinLfgWrapper } from "./grok-bin-lfg-wrapper"
import { ensureLfgConfigFiles } from "../config/lfg-config"
import { DEFAULT_CODING_TOOL_ADAPTER, type CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import {
  resolveLazycodexAgentOverrides,
  writeOmoAgentOverridesFile,
  type LazycodexAgentModelOverride,
} from "../agents/lazycodex-agent-overrides"
import { migrateLegacyUserOverrideConfig } from "../agents/user-model-overrides"
import { resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config"
import { resolveGrokAdapterPluginRoot } from "../payload/grok-adapter-paths"
import { overlayLfgComponentShims } from "../payload/install"
import { runInternalGrokInstall } from "./run-internal"
import { syncLazycodexAgentsToGrokLedger, type SyncLazycodexAgentsResult } from "../agents/sync-lazycodex-agents-to-grok"
import { componentInventoryPath } from "../payload/component-inventory"
import { applyRecommendationsToOverrideMap } from "../models/model-recommendation-availability"
import { purgeInvalidGrokModelSettings, type PurgeInvalidModelSettingsResult } from "../config/purge-invalid-model-settings"
import { resolveGrokApiKey } from "./grok-api-key"
import { resolveGrokSetupHome } from "./grok-home"
import { resolveExistingStampedLfgSetup } from "./run-grok-install-existing"
import { syncPostInstallPluginPayload, type PostInstallPluginSyncResult } from "./run-grok-install-post-sync"
import { ensureXaiGrokMcpConfig, type EnsureXaiGrokMcpConfigResult } from "../mcp/xai-mcp-config"
import { ensureAgentsSkillsPath } from "./ensure-agents-skills-path"

export const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install" as const
export const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install" as const

export type GrokInstallRunResult = {
  readonly ok: boolean
  readonly configUpdate: Awaited<ReturnType<typeof writeGrokModelConfig>> | null
  readonly internalStep: JsonObject
  readonly omoAgents: SyncLazycodexAgentsResult | null
  readonly agentOverridesPath: string | null
  readonly lfgConfigPath: string | null
  readonly pluginsEnabled: Awaited<ReturnType<typeof ensureLfgPluginsEnabled>> | null
  readonly subagentModels: Awaited<ReturnType<typeof ensureLfgSubagentModels>> | null
  /** Hooks are always (re)normalized on every setup so the bridge, config loader, and ultrawork hooks are guaranteed loaded. */
  readonly hooks: PostInstallPluginSyncResult | null
  readonly invalidModelSettings: PurgeInvalidModelSettingsResult | null
  /** Built-in xai_grok MCP registration in config.toml (Grok enhanced search). */
  readonly xaiMcp: EnsureXaiGrokMcpConfigResult | null
}

export type GrokInstallRunOptions = {
  readonly force?: boolean
  readonly fullAgentModels?: Readonly<Record<string, LazycodexAgentModelOverride>>
  readonly installOnly?: boolean
  readonly codingToolAdapter?: CodingToolAdapterId
}

type SubagentModelMapping = NonNullable<Parameters<typeof ensureLfgSubagentModels>[1]>

/** Single transaction: internal plugin sync then optional config.toml merge (lfg-owned sections). */
export async function runGrokInstall(
  discovery: ModelDiscovery | null,
  env: NodeJS.ProcessEnv = process.env,
  options: GrokInstallRunOptions = {},
): Promise<GrokInstallRunResult> {
  const home = resolveGrokSetupHome(env)
  const codingToolAdapter = options.codingToolAdapter ?? DEFAULT_CODING_TOOL_ADAPTER
  const homeEnv = { ...env, HOME: home }
  migrateLegacyUserOverrideConfig({ home })
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
    // Keep PATH wrapper current (e.g. new lfg-owned commands like `claude`).
    await ensureGrokBinLfgWrapper(home)
    // Built-in xai_grok MCP still registers on install-only so /mcps gets enhanced search without full model config merge.
    const xaiMcpInstallOnly = await ensureXaiGrokMcpConfig(home)
    return {
      ok: internalStep.ok === true,
      configUpdate: null,
      internalStep: { ...internalStep, installOnly: true },
      omoAgents: null,
      agentOverridesPath: null,
      lfgConfigPath: null,
      pluginsEnabled: null,
      subagentModels: null,
      hooks: hooksFresh,
      invalidModelSettings: null,
      xaiMcp: xaiMcpInstallOnly,
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
        )
    const fullAgentModels = grokRoutedOverrideMap(options.fullAgentModels ?? overrideMap, discovery)
    const hasRealProxyDiscovery = discovery !== null && typeof discovery.baseUrl === "string" && discovery.baseUrl.trim().length > 0
    const hasHostAuthOnlyDiscovery = discovery !== null && !hasRealProxyDiscovery && codingToolAdapter === "grok"
    const configUpdate =
      hasRealProxyDiscovery || hasHostAuthOnlyDiscovery
        ? await writeGrokModelConfig(discovery, {
            apiKey,
            home,
            agentConfig: resolvedAgents,
            fullAgentModels,
            hostAuthOnly: hasHostAuthOnlyDiscovery,
          })
        : null
    const overridesPath = await writeOmoAgentOverridesFile(home, fullAgentModels)
    const configFiles = await ensureLfgConfigFiles(home, fullAgentModels, codingToolAdapter)
    const omoAgents = await syncLazycodexAgentsToGrokLedger(home, fullAgentModels)
    const pluginsEnabled = await ensureLfgPluginsEnabled(home)
    await ensureLfgAgentsPreferred(home)
    await ensureAgentsSkillsPath(home)
    const subagentModels = await ensureLfgSubagentModels(
      home,
      subagentModelMappingFromDiscovery(discovery, resolvedAgents),
    )

    // Hooks must always be (re)normalized on every setup run so the Grok bridge,
    // lfg-config-loader, project omo ledger, and ultrawork component hooks are guaranteed loaded.
    // Component shims are also re-overlaid to repair upstream CLIs that crash on missing
    // package imports (e.g. @code-yeongyu/lsp-daemon in the upstream lsp component).
    await overlayLfgComponentShims(existingSetup.pluginRoot)
    await ensureGrokBinLfgWrapper(home)
    const hooksNormalized = await syncPostInstallPluginPayload(existingSetup.pluginRoot)
    const xaiMcpPreserve = await ensureXaiGrokMcpConfig(home)
    const allowModels = Object.values(fullAgentModels).flatMap((setting) =>
      [setting.model, setting.modelFallback].filter((id): id is string => typeof id === "string" && id.length > 0),
    )
    const invalidModelSettings = await purgeInvalidGrokModelSettings({ home, discovery, allowModels })

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
      agentOverridesPath: overridesPath,
      lfgConfigPath: configFiles.configPath,
      pluginsEnabled,
      subagentModels,
      hooks: hooksNormalized,
      invalidModelSettings,
      xaiMcp: xaiMcpPreserve,
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
      )
  const fullAgentModels = grokRoutedOverrideMap(options.fullAgentModels ?? overrideMap, discovery)
  const hasRealProxyDiscovery = discovery !== null && typeof discovery.baseUrl === "string" && discovery.baseUrl.trim().length > 0
  const hasHostAuthOnlyDiscovery = discovery !== null && !hasRealProxyDiscovery && codingToolAdapter === "grok"
  const configUpdate =
    hasRealProxyDiscovery || hasHostAuthOnlyDiscovery
      ? await writeGrokModelConfig(discovery, {
          apiKey,
          home,
          agentConfig: resolvedAgents,
          fullAgentModels,
          hostAuthOnly: hasHostAuthOnlyDiscovery,
        })
      : null
  const overridesPath = await writeOmoAgentOverridesFile(home, fullAgentModels)
  const configFiles = await ensureLfgConfigFiles(home, fullAgentModels, codingToolAdapter)
  // Use fullAgentModels (same as preserve path) so native OMO agents always get model routing.
  const omoAgents = await syncLazycodexAgentsToGrokLedger(home, fullAgentModels)
  const pluginsEnabled = await ensureLfgPluginsEnabled(home)
  await ensureLfgAgentsPreferred(home)
  await ensureAgentsSkillsPath(home)
  const subagentModels = await ensureLfgSubagentModels(
    home,
    subagentModelMappingFromDiscovery(discovery, resolvedAgents),
  )

  await ensureGrokBinLfgWrapper(home)

  // Always (re)normalize hooks on every install path (fresh or repair), so the Grok bridge,
  // lfg-config-loader, project omo ledger, and ultrawork component hooks are guaranteed present.
  const pluginRootAfterInstall = (await resolveGrokAdapterPluginRoot(home))?.pluginRoot
  let hooksFresh: PostInstallPluginSyncResult | null = null
  if (pluginRootAfterInstall) {
    hooksFresh = await syncPostInstallPluginPayload(pluginRootAfterInstall)
  }
  const xaiMcpFresh = await ensureXaiGrokMcpConfig(home)
  const allowModels = Object.values(fullAgentModels).flatMap((setting) =>
    [setting.model, setting.modelFallback].filter((id): id is string => typeof id === "string" && id.length > 0),
  )
  const invalidModelSettings = await purgeInvalidGrokModelSettings({ home, discovery, allowModels })

  return {
    ok: internalStep.ok === true,
    configUpdate,
    internalStep,
    omoAgents,
    agentOverridesPath: overridesPath,
    lfgConfigPath: configFiles.configPath,
    pluginsEnabled,
    subagentModels,
    hooks: hooksFresh,
    invalidModelSettings,
    xaiMcp: xaiMcpFresh,
  }
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
    reasoning: resolvedAgents.reasoning?.model ?? discovery?.mapping.reasoning ?? "grok-4.5",
    coding: resolvedAgents.coding?.model ?? discovery?.mapping.coding ?? "grok-composer-2.5-fast",
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
