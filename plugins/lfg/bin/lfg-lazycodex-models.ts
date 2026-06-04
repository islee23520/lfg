import type { Dirent } from "node:fs"
import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { isRecord, readJsonObject, type JsonObject } from "./lfg-json"

export const LAZYCODEX_MODEL_CATALOG_FILE = "model-catalog.json"
export const LAZYCODEX_COMPONENTS_DIR = "components"

const MODEL_LINE_PATTERN = /^model\s*=\s*"([^"]+)"/m
const UNSUPPORTED_GROK_BYOK_MODELS = new Set(["gpt-5.2"])

export type LazycodexModelDiscovery = {
  readonly status: "catalog_and_agents" | "catalog_only" | "agents_only" | "none"
  readonly catalogPath: string | null
  readonly catalogVersion: string | null
  readonly models: readonly string[]
  readonly modelSources: Readonly<Record<string, readonly string[]>>
}

type ModelCatalog = {
  readonly version: string | null
  readonly current: { readonly model: string }
  readonly roles: Readonly<Record<string, { readonly model: string }>>
  readonly managedProfiles: readonly { readonly model: string }[]
}

export function parseRequiredModelsFromEnv(env: NodeJS.ProcessEnv): readonly string[] | null {
  const raw = env.LFG_GROK_MODELS?.trim()
  if (!raw) return null
  const models = [...new Set(raw.split(",").map((entry) => entry.trim()).filter(isSupportedGrokByokModel))]
  return models.length > 0 ? models : null
}

export function lazycodexModelCatalogPath(adapterRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.LAZYCODEX_MODEL_CATALOG_PATH?.trim()
  return configured ? configured : join(adapterRoot, LAZYCODEX_MODEL_CATALOG_FILE)
}

export async function discoverLazycodexPluginModels(adapterRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<LazycodexModelDiscovery> {
  const catalogPath = lazycodexModelCatalogPath(adapterRoot, env)
  const catalog = await readModelCatalog(catalogPath)
  const agentModels = await discoverAgentTomlModels(adapterRoot)
  const modelSources: Record<string, string[]> = {}
  const add = (modelId: string, source: string): void => {
    const trimmed = modelId.trim()
    if (!isSupportedGrokByokModel(trimmed)) return
    const existing = modelSources[trimmed] ?? []
    if (!existing.includes(source)) modelSources[trimmed] = [...existing, source]
  }

  if (catalog) {
    add(catalog.current.model, "model-catalog.current")
    for (const [role, profile] of Object.entries(catalog.roles)) add(profile.model, `model-catalog.roles.${role}`)
    for (const [index, profile] of catalog.managedProfiles.entries()) add(profile.model, `model-catalog.managedProfiles.${index}`)
  }
  for (const [agentPath, modelId] of agentModels) add(modelId, `agent:${agentPath}`)

  const models = Object.keys(modelSources).sort()
  return {
    status: discoveryStatus(catalog !== null, agentModels.length > 0),
    catalogPath: catalog ? catalogPath : null,
    catalogVersion: catalog?.version ?? null,
    models,
    modelSources,
  }
}

export async function resolveRequiredModels(adapterRoot: string | null, env: NodeJS.ProcessEnv = process.env): Promise<readonly string[]> {
  const fromEnv = parseRequiredModelsFromEnv(env)
  if (fromEnv !== null) return fromEnv
  if (!adapterRoot) return []
  return (await discoverLazycodexPluginModels(adapterRoot, env)).models
}

export function lazycodexModelDiscoverySummary(discovery: LazycodexModelDiscovery): JsonObject {
  return {
    status: discovery.status,
    catalogPath: discovery.catalogPath,
    catalogVersion: discovery.catalogVersion,
    models: [...discovery.models],
    modelSources: discovery.modelSources,
  }
}

function isSupportedGrokByokModel(modelId: string): boolean {
  return modelId.length > 0 && !UNSUPPORTED_GROK_BYOK_MODELS.has(modelId)
}

function discoveryStatus(catalogFound: boolean, agentsFound: boolean): LazycodexModelDiscovery["status"] {
  if (catalogFound && agentsFound) return "catalog_and_agents"
  if (catalogFound) return "catalog_only"
  if (agentsFound) return "agents_only"
  return "none"
}

async function readModelCatalog(path: string): Promise<ModelCatalog | null> {
  try {
    return parseModelCatalog(await readJsonObject(path))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

function parseModelCatalog(value: JsonObject): ModelCatalog | null {
  if (!isRecord(value.current)) return null
  const currentModel = value.current.model
  if (typeof currentModel !== "string" || !currentModel.trim()) return null

  const roles: Record<string, { readonly model: string }> = {}
  if (isRecord(value.roles)) {
    for (const [role, profile] of Object.entries(value.roles)) {
      if (!isRecord(profile) || typeof profile.model !== "string" || !profile.model.trim()) continue
      roles[role] = { model: profile.model.trim() }
    }
  }

  const managedProfiles: { readonly model: string }[] = []
  if (Array.isArray(value.managedProfiles)) {
    for (const profile of value.managedProfiles) {
      if (!isRecord(profile) || !isRecord(profile.match) || typeof profile.match.model !== "string") continue
      if (profile.match.model.trim()) managedProfiles.push({ model: profile.match.model.trim() })
    }
  }

  return {
    version: typeof value.version === "string" ? value.version : null,
    current: { model: currentModel.trim() },
    roles,
    managedProfiles,
  }
}

async function discoverAgentTomlModels(adapterRoot: string): Promise<readonly (readonly [string, string])[]> {
  const componentsRoot = join(adapterRoot, LAZYCODEX_COMPONENTS_DIR)
  if (!(await pathExists(componentsRoot))) return []
  const componentEntries = await readdir(componentsRoot, { withFileTypes: true })
  const discovered: Array<[string, string]> = []
  for (const component of componentEntries) await collectComponentAgentModels(component, componentsRoot, discovered)
  return discovered
}

async function collectComponentAgentModels(component: Dirent<string>, componentsRoot: string, discovered: Array<[string, string]>): Promise<void> {
  if (!component.isDirectory()) return
  const agentsDir = join(componentsRoot, component.name, "agents")
  let agentEntries: Dirent<string>[]
  try {
    agentEntries = await readdir(agentsDir, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return
    throw error
  }
  for (const agent of agentEntries) {
    if (!agent.isFile() || !agent.name.endsWith(".toml")) continue
    const relativePath = join(LAZYCODEX_COMPONENTS_DIR, component.name, "agents", agent.name)
    const match = (await readFile(join(agentsDir, agent.name), "utf8")).match(MODEL_LINE_PATTERN)
    if (match?.[1]) discovered.push([relativePath, match[1]])
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}
