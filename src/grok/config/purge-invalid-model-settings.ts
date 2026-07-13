import { readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ModelDiscovery } from "../../cli/models/lfg-models"
import type { JsonObject } from "../../shared/json"
import {
  isForeignProviderModel,
  isGrokFamilyModel,
  modelIsAvailable,
  pickRoleFallbacks,
  roleFallbackForAgent,
} from "./invalid-model-settings"
import {
  purgeInvalidModelSettingsToml,
  stripMissingPlugins,
  type RemappedRoute,
} from "./purge-invalid-model-settings-toml"
import {
  readOmoAgentOverridesFile,
  writeOmoAgentOverridesFile,
  type LazycodexAgentModelOverride,
  type LazycodexAgentOverrideMap,
} from "../agents/lazycodex-agent-overrides"

export type PurgeInvalidModelSettingsResult = {
  readonly path: string
  readonly changed: boolean
  readonly availableModelIds: readonly string[]
  readonly remappedRoutes: readonly RemappedRoute[]
  readonly removedModelSections: readonly string[]
  readonly removedPluginIds: readonly string[]
  readonly overridesChanged: boolean
  readonly skipped: boolean
}

export type PurgeInvalidModelSettingsOptions = {
  readonly home: string
  readonly discovery?: ModelDiscovery | null
  /** Extra model ids that must stay (e.g. this-run setup choices). */
  readonly allowModels?: readonly string[]
}

/**
 * Host catalog for purge: discovery + models_cache only.
 * Do NOT treat existing [model.*] section names as available — those may themselves be stale
 * (see purgeInvalidModelSettingsToml).
 */
export async function resolveAvailableModelIds(
  home: string,
  discovery: ModelDiscovery | null | undefined = null,
): Promise<readonly string[]> {
  const ids = new Set<string>()
  for (const id of discovery?.modelIds ?? []) addModelId(ids, id)
  for (const id of await readModelsCacheIds(home)) addModelId(ids, id)
  return [...ids]
}

export async function purgeInvalidGrokModelSettings(
  options: PurgeInvalidModelSettingsOptions,
): Promise<PurgeInvalidModelSettingsResult> {
  const home = options.home
  const path = join(home, ".grok", "config.toml")
  const catalog = await resolveAvailableModelIds(home, options.discovery)
  const hasHostCatalog =
    (options.discovery?.modelIds?.length ?? 0) > 0 || (await readModelsCacheIds(home)).length > 0
  const available = new Set([...catalog, ...(options.allowModels ?? [])])
  if (hasHostCatalog) {
    addModelId(available, "grok-4.5")
    addModelId(available, "grok-composer-2.5-fast")
    addModelId(available, "grok-build")
  }
  const installedPlugins = await listInstalledPluginIds(home)

  let toml = ""
  try {
    toml = await readFile(path, "utf8")
  } catch {
    toml = ""
  }

  if (toml.length === 0) {
    return emptyResult(path, [...available], true)
  }

  if (!hasHostCatalog) {
    const { next, removed } = stripMissingPlugins(toml, installedPlugins)
    const configChanged = next !== toml
    if (configChanged) await writeFile(path, next, "utf8")
    return {
      path,
      changed: configChanged,
      availableModelIds: [],
      remappedRoutes: [],
      removedModelSections: [],
      removedPluginIds: removed,
      overridesChanged: false,
      skipped: true,
    }
  }

  const purged = purgeInvalidModelSettingsToml(toml, available, installedPlugins)
  const configChanged = purged.next !== toml
  if (configChanged) {
    await writeFile(path, purged.next, "utf8")
  }

  const overridesChanged = await purgeInvalidAgentOverrides(home, available)

  return {
    path,
    changed: configChanged || overridesChanged,
    availableModelIds: [...available],
    remappedRoutes: purged.remappedRoutes,
    removedModelSections: purged.removedModelSections,
    removedPluginIds: purged.removedPluginIds,
    overridesChanged,
    skipped: false,
  }
}

export function purgeInvalidModelSettingsJson(result: PurgeInvalidModelSettingsResult): JsonObject {
  return {
    changed: result.changed,
    skipped: result.skipped,
    path: result.path,
    availableModelIds: [...result.availableModelIds],
    remappedRoutes: result.remappedRoutes.map((route) => ({ ...route })),
    removedModelSections: [...result.removedModelSections],
    removedPluginIds: [...result.removedPluginIds],
    overridesChanged: result.overridesChanged,
  }
}

async function purgeInvalidAgentOverrides(home: string, available: ReadonlySet<string>): Promise<boolean> {
  const current = await readOmoAgentOverridesFile(home)
  if (Object.keys(current).length === 0) return false
  const fallbacks = pickRoleFallbacks([...available])
  const next: Record<string, LazycodexAgentModelOverride> = {}
  let changed = false
  for (const [name, setting] of Object.entries(current)) {
    const cleaned = cleanOverride(name, setting, available, fallbacks)
    next[name] = cleaned
    if (!sameOverride(setting, cleaned)) changed = true
  }
  if (!changed) return false
  await writeOmoAgentOverridesFile(home, next as LazycodexAgentOverrideMap)
  return true
}

function cleanOverride(
  name: string,
  setting: LazycodexAgentModelOverride,
  available: ReadonlySet<string>,
  fallbacks: ReturnType<typeof pickRoleFallbacks>,
): LazycodexAgentModelOverride {
  // Keep intentional custom ids; remap foreign leftovers and Grok ids missing from the catalog.
  const model = modelIsAvailable(setting.model, available)
    ? setting.model
    : !isForeignProviderModel(setting.model) && !isGrokFamilyModel(setting.model)
      ? setting.model
      : roleFallbackForAgent(name, fallbacks)
  const keepFallback =
    setting.modelFallback !== undefined &&
    modelIsAvailable(setting.modelFallback, available) &&
    setting.modelFallback !== model
  return {
    model,
    reasoningLevel: setting.reasoningLevel,
    ...(setting.serviceTier !== undefined ? { serviceTier: setting.serviceTier } : {}),
    ...(keepFallback ? { modelFallback: setting.modelFallback } : {}),
    ...(keepFallback && setting.modelFallbackReasoningLevel !== undefined
      ? { modelFallbackReasoningLevel: setting.modelFallbackReasoningLevel }
      : {}),
    ...(keepFallback && setting.modelFallbackServiceTier !== undefined
      ? { modelFallbackServiceTier: setting.modelFallbackServiceTier }
      : {}),
    ...(setting.roleRationale !== undefined ? { roleRationale: setting.roleRationale } : {}),
  }
}

export { isForeignProviderModel }

function sameOverride(a: LazycodexAgentModelOverride, b: LazycodexAgentModelOverride): boolean {
  return (
    a.model === b.model &&
    a.reasoningLevel === b.reasoningLevel &&
    a.serviceTier === b.serviceTier &&
    a.modelFallback === b.modelFallback &&
    a.modelFallbackReasoningLevel === b.modelFallbackReasoningLevel &&
    a.modelFallbackServiceTier === b.modelFallbackServiceTier &&
    a.roleRationale === b.roleRationale
  )
}

async function readModelsCacheIds(home: string): Promise<readonly string[]> {
  try {
    const raw = await readFile(join(home, ".grok", "models_cache.json"), "utf8")
    const parsed = JSON.parse(raw) as { readonly models?: Readonly<Record<string, unknown>> }
    return Object.keys(parsed.models ?? {})
  } catch {
    return []
  }
}

async function listInstalledPluginIds(home: string): Promise<ReadonlySet<string>> {
  const ids = new Set<string>()
  for (const root of [join(home, ".grok", "plugins"), join(home, ".grok", "installed-plugins")]) {
    try {
      const entries = await readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) ids.add(entry.name)
      }
    } catch {
      // missing root
    }
  }
  return ids
}

function addModelId(ids: Set<string>, model: string): void {
  const trimmed = model.trim()
  if (trimmed.length === 0) return
  ids.add(trimmed)
  const slash = trimmed.lastIndexOf("/")
  if (slash !== -1) ids.add(trimmed.slice(slash + 1))
}

function emptyResult(
  path: string,
  availableModelIds: readonly string[],
  skipped: boolean,
): PurgeInvalidModelSettingsResult {
  return {
    path,
    changed: false,
    availableModelIds,
    remappedRoutes: [],
    removedModelSections: [],
    removedPluginIds: [],
    overridesChanged: false,
    skipped,
  }
}
