import { lstat } from "node:fs/promises"
import type { JsonObject } from "../cli/lfg-json"
import { grokConfigJson, writeGrokModelConfig } from "../cli/lfg-grok-config"
import type { ModelDiscovery } from "../cli/lfg-models"
import { modelDiscoveryEnv } from "../cli/lfg-models"
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled, ensureLfgSubagentModels } from "./grok-plugins-enable"
import { ensureLfgConfigFiles } from "./lfg-config"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"
import { ensureCuaDriverSkill, ensureUlwWorkflowSkills } from "./ensure-cua-driver-skill"
import { ensureHephaestusModelGate } from "./ensure-hephaestus-model-gate"
import { normalizePluginHooksJson } from "./normalize-plugin-hooks"
import {
  resolveLazycodexAgentOverrides,
  writeLazycodexAgentOverridesFile,
} from "./lazycodex-agent-overrides"
import { resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { readGrokInstallStamp } from "./install"
import { runInternalGrokInstall } from "./run-internal"
import { syncLazycodexAgentsToGrokLedger, type SyncLazycodexAgentsResult } from "./sync-lazycodex-agents-to-grok"
import { componentInventoryPath } from "./component-inventory"
import { applyRecommendationsToOverrideMap } from "./model-recommendation-patterns"
import { resolveGrokApiKey } from "./grok-api-key"
import { resolveGrokSetupHome } from "./grok-home"

export const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install" as const
export const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install" as const

export type GrokInstallRunResult = {
  readonly ok: boolean
  readonly configUpdate: Awaited<ReturnType<typeof writeGrokModelConfig>> | null
  readonly internalStep: JsonObject
  readonly lazycodexAgents: SyncLazycodexAgentsResult | null
  readonly agentOverridesPath: string | null
  readonly lfgConfigPath: string | null
  readonly pluginsEnabled: Awaited<ReturnType<typeof ensureLfgPluginsEnabled>> | null
  readonly subagentModels: Awaited<ReturnType<typeof ensureLfgSubagentModels>> | null
  /** Hooks are always (re)normalized on every setup so the bridge, config loader, and ultrawork hooks are guaranteed loaded. */
  readonly hooks: { readonly path: string; readonly hookNames: readonly string[]; readonly changed: boolean } | null
}

export type GrokInstallRunOptions = {
  readonly force?: boolean
  /** Full per-agent model+reasoning map (all agents) to write into [lazycodex.agents.*] on setup. */
  readonly fullAgentModels?: Readonly<Record<string, { model: string; reasoningLevel: string }>>
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
  const existingSetup = options.force === true ? null : await resolveExistingStampedLfgSetup(home)
  if (existingSetup !== null) {
    const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery)
    const agentOverrideMap = discovery?.agentOverrideMap
    const overrideMap = agentOverrideMap !== undefined
      ? agentOverrideMap
      : applyRecommendationsToOverrideMap(
          await resolveLazycodexAgentOverrides(home, resolvedAgents),
          discovery?.modelIds ?? [],
          discovery?.preset,
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
    const overridesPath = await writeLazycodexAgentOverridesFile(home, overrideMap)
    const configFiles = await ensureLfgConfigFiles(home, overrideMap)
    const lazycodexAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap)
    const pluginsEnabled = await ensureLfgPluginsEnabled(home)
    await ensureLfgAgentsPreferred(home)
    const subagentModels = await ensureLfgSubagentModels(
      home,
      subagentModelMappingFromDiscovery(discovery, resolvedAgents),
    )

    // Hooks must always be (re)normalized on every setup run so the Grok bridge,
    // lfg-config-loader, project omo ledger, and ultrawork component hooks are guaranteed loaded.
    const hooksNormalized = await normalizePluginHooksJson(existingSetup.pluginRoot)
    await ensureCuaDriverSkill(existingSetup.pluginRoot)
    await ensureUlwWorkflowSkills(existingSetup.pluginRoot)
    await ensureHephaestusModelGate(existingSetup.pluginRoot)

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
      lazycodexAgents,
      agentOverridesPath: overridesPath,
      lfgConfigPath: configFiles.configPath,
      pluginsEnabled,
      subagentModels,
      hooks: {
        path: hooksNormalized.path,
        hookNames: hooksNormalized.hookNames,
        changed: hooksNormalized.changed,
      },
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
        discovery?.preset,
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
  const overridesPath = await writeLazycodexAgentOverridesFile(home, overrideMap)
  const configFiles = await ensureLfgConfigFiles(home, overrideMap)
  const lazycodexAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap)
  const pluginsEnabled = await ensureLfgPluginsEnabled(home)
  await ensureLfgAgentsPreferred(home)
  const subagentModels = await ensureLfgSubagentModels(
    home,
    subagentModelMappingFromDiscovery(discovery, resolvedAgents),
  )

  // Always (re)normalize hooks on every install path (fresh or repair), so the Grok bridge,
  // lfg-config-loader, project omo ledger, and ultrawork component hooks are guaranteed present.
  const pluginRootAfterInstall = (await resolveGrokAdapterPluginRoot(home))?.pluginRoot
  let hooksFresh: { readonly path: string; readonly hookNames: readonly string[]; readonly changed: boolean } | null = null
  if (pluginRootAfterInstall) {
    const norm = await normalizePluginHooksJson(pluginRootAfterInstall)
    await ensureCuaDriverSkill(pluginRootAfterInstall)
    await ensureUlwWorkflowSkills(pluginRootAfterInstall)
    await ensureHephaestusModelGate(pluginRootAfterInstall)
    hooksFresh = { path: norm.path, hookNames: norm.hookNames, changed: norm.changed }
  }

  return {
    ok: internalStep.ok === true,
    configUpdate,
    internalStep,
    lazycodexAgents,
    agentOverridesPath: overridesPath,
    lfgConfigPath: configFiles.configPath,
    pluginsEnabled,
    subagentModels,
    hooks: hooksFresh,
  }
}

type ExistingStampedLfgSetup = {
  readonly pluginRoot: string
}

async function resolveExistingStampedLfgSetup(home: string): Promise<ExistingStampedLfgSetup | null> {
  const resolved = await resolveGrokAdapterPluginRoot(home)
  const ok =
    resolved?.location === "native_plugins" &&
    resolved.pluginDirName === "lfg" &&
    (await isRealDirectory(resolved.pluginRoot)) &&
    (await readGrokInstallStamp(resolved.pluginRoot)) !== null &&
    (await readAdapterHooksTrust(resolved.pluginRoot)).ok
  return ok ? { pluginRoot: resolved.pluginRoot } : null
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
  }
}

async function isRealDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
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
