import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { removeTomlKey, removeTomlSectionsByPrefix, tomlString, upsertSection, upsertTomlKey } from "./lfg-grok-config-toml"
import { upsertModelSections } from "./lfg-grok-model-sections"
import { aliasGroupKey } from "../models/lfg-model-context-catalog"
import type { JsonObject } from "../../shared/json"
import { defaultLazycodexAgentConfig, type LazycodexAgentConfig, type ModelDiscovery } from "../models/lfg-models"
import { normalizeEngine, type Engine } from "../../core/lfg/external-engine"
import {
  defaultBackendRoutingConfig,
  normalizeCliBackend,
  type BackendRoutingConfig,
} from "../../core/lfg/backend-routing"

export type GrokConfigUpdate = {
  readonly status: "configured"
  readonly path: string
  readonly modelsBaseUrl: string
}

export type GrokConfigOptions = {
  readonly home?: string
  readonly apiKey?: string
  readonly agentConfig?: LazycodexAgentConfig
  readonly hostAuthOnly?: boolean
  readonly reconcileModelAliases?: boolean
  readonly fullAgentModels?: Readonly<
    Record<
      string,
      {
        readonly model: string
        readonly reasoningLevel: string
        readonly modelFallback?: string
        readonly modelFallbackReasoningLevel?: string
      }
    >
  >
}

export const LFG_OWNED_GROK_CONFIG_SECTIONS = [
  "endpoints.models_base_url",
  "models.default",
  "omo.providers",
  "omo.external_engine",
] as const

export async function writeBackendRoutingConfig(home: string, config: BackendRoutingConfig): Promise<string> {
  const path = join(home, ".grok", "lfg-backend-routing.json")
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  return path
}

export async function readBackendRoutingConfig(home: string): Promise<BackendRoutingConfig> {
  const source = await readTextIfExists(join(home, ".grok", "config.toml"))
  const defaults = await readStoredBackendRoutingConfig(home)
  const globalValue = readTomlStringKey(source, "omo.backend_routing", "global")
  const legacyValue = readTomlStringKey(source, "omo.external_engine", "backend")
  const normalizedGlobal = normalizeCliBackend(globalValue) ?? normalizeCliBackend(legacyValue)
  return {
    version: 1,
    global: normalizedGlobal ?? defaults.global,
    categories: defaults.categories,
    agents: defaults.agents,
  }
}

async function readStoredBackendRoutingConfig(home: string): Promise<BackendRoutingConfig> {
  const defaults = defaultBackendRoutingConfig()
  try {
    const parsed: unknown = JSON.parse(await readFile(join(home, ".grok", "lfg-backend-routing.json"), "utf8"))
    if (typeof parsed !== "object" || parsed === null) return defaults
    const record = Object.fromEntries(Object.entries(parsed))
    const global = normalizeCliBackend(record.global)
    const agentsValue = record.agents
    const sisyphus = typeof agentsValue === "object" && agentsValue !== null
      ? normalizeCliBackend(Object.fromEntries(Object.entries(agentsValue)).sisyphus)
      : null
    return {
      version: 1,
      global: global ?? defaults.global,
      categories: {},
      agents: { sisyphus: sisyphus ?? defaults.agents.sisyphus },
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return defaults
    if (error instanceof SyntaxError) return defaults
    throw error
  }
}

export async function writeBackendEnginePreference(home: string, engine: Engine): Promise<string> {
  const path = join(home, ".grok", "config.toml")
  const current = await readTextIfExists(path)
  const next = upsertSection(current, "omo.external_engine", [`backend = ${tomlString(engine)}`])
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, "utf8")
  return path
}

export async function readBackendEnginePreference(home: string): Promise<Engine | null> {
  const source = await readTextIfExists(join(home, ".grok", "config.toml"))
  const section = /(?:^|\n)\[omo\.external_engine]\n([\s\S]*?)(?=\n\[[^\n]+]|$)/.exec(source)?.[1] ?? ""
  const value = /^\s*backend\s*=\s*["']([^"']+)["']\s*$/m.exec(section)?.[1]
  return normalizeEngine(value) ?? null
}

function readTomlStringKey(source: string, section: string, key: string): string | null {
  return readTomlStringSection(source, section).find(([name]) => name === key)?.[1] ?? null
}

function readTomlStringSection(source: string, section: string): readonly (readonly [string, string])[] {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const body = new RegExp(`(?:^|\\n)\\[${escaped}\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+]|$)`).exec(source)?.[1] ?? ""
  return body.split("\n").flatMap((line) => {
    const match = /^\s*([A-Za-z0-9_-]+)\s*=\s*["']([^"']+)["']\s*$/.exec(line)
    return match?.[1] === undefined || match[2] === undefined ? [] : [[match[1], match[2]] as const]
  })
}

export async function writeGrokModelConfig(discovery: ModelDiscovery, options: GrokConfigOptions = {}): Promise<GrokConfigUpdate> {
  const home = options.home ?? homedir()
  const path = join(home, ".grok", "config.toml")
  const baseUrl = modelsBaseUrl(discovery)
  const current = await readTextIfExists(path)
  const endpointsRaw = options.hostAuthOnly === true
    ? removeTomlSectionsByPrefix(
        removeTomlKey(removeTomlKey(current, "endpoints", "models_base_url"), "endpoints", "api_key"),
        "model.",
      )
    : removeTomlKey(upsertTomlKey(current, "endpoints", "models_base_url", baseUrl), "endpoints", "api_key")
  // hostAuthOnly may leave a bare [endpoints] header with no keys — drop it so Grok does not see junk.
  const endpoints = options.hostAuthOnly === true ? removeEmptyTomlSection(endpointsRaw, "endpoints") : endpointsRaw
  // When discovery is live, drop only stale [model.*] aliases not in this discovery (keep section
  // order stable for aliases that remain — full strip+reappend reorders and breaks idempotency).
  const reconcileModelAliases = options.reconcileModelAliases !== false
  const modelSource = options.hostAuthOnly === true || !reconcileModelAliases
    ? removeTomlSectionsByPrefix(endpoints, "model.")
    : removeStaleModelSections(endpoints, discovery)
  const modelConfig = reconcileModelAliases
    ? upsertModelSections(modelSource, discovery, options.hostAuthOnly === true ? null : baseUrl, options.apiKey, current)
    : modelSource
  const withoutOmoModels = removeTomlSectionsByPrefix(modelConfig, "omo.models")
  const withoutOmoAgents = removeTomlSectionsByPrefix(withoutOmoModels, "omo.agents")
  const next = removeTomlSectionsByPrefix(withoutOmoAgents, "lazycodex")
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, "utf8")
  return { status: "configured", path, modelsBaseUrl: baseUrl }
}

/** Remove a TOML table that has no assignment lines left (bare `[section]` only). */
function removeEmptyTomlSection(source: string, section: string): string {
  const header = `[${section}]`
  const start = source.indexOf(header)
  if (start === -1) return source
  const afterHeader = start + header.length
  const endMatch = /\n\[[^\n]+]/.exec(source.slice(afterHeader))
  const end = endMatch?.index === undefined ? source.length : afterHeader + endMatch.index + 1
  const body = source.slice(afterHeader, end)
  // Keep the section if it still has any key = value assignment.
  if (/^\s*[A-Za-z0-9_.-]+\s*=/m.test(body)) return source
  const before = source.slice(0, start)
  const after = source.slice(end)
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n")
}

/** Drop [model.*] sections whose alias is not grok-build and not in the live discovery set. */
function removeStaleModelSections(source: string, discovery: ModelDiscovery): string {
  // Keep exact ids plus alias-group keys so display aliases (e.g. "GPT-5.5") survive when
  // discovery lists the canonical form ("gpt-5.5") — matches upsertModelSections T1 behavior.
  const keepExact = new Set<string>(["grok-build", ...discovery.modelIds])
  const keepGroups = new Set<string>(["grok-build", ...discovery.modelIds.map((id) => aliasGroupKey(id))])
  const lines = source.split("\n")
  const kept: string[] = []
  let dropping = false
  for (const line of lines) {
    const match = /^\s*\[model\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+))\]\s*$/.exec(line)
    if (match) {
      const alias = match[1] ?? match[2] ?? match[3] ?? ""
      dropping =
        alias.length > 0 && !keepExact.has(alias) && !keepGroups.has(aliasGroupKey(alias))
    } else if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      dropping = false
    }
    if (!dropping) kept.push(line)
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n")
}

export function grokConfigJson(update: GrokConfigUpdate): JsonObject {
  return {
    status: update.status,
    path: update.path,
    modelsBaseUrl: update.modelsBaseUrl,
  }
}

export type ModelConfigRefreshResult = {
  readonly ok: boolean
  readonly status: "refreshed" | "no_discovery"
  readonly discovery: ModelDiscovery | null
  readonly configUpdate: GrokConfigUpdate | null
  readonly modelsBaseUrl: string | null
}

/**
 * Lightweight refresh of model info + safe model auth into ~/.grok/config.toml.
 * Performs discovery (if provided) and writes endpoint and meaningful model-alias sections.
 * Does NOT touch the Grok plugin tree, hooks, or agents TOMLs.
 * Context windows are sourced from the discovery (proxy first, then public LiteLLM catalog enrichment, local wins).
 * api_key is written from the provided apiKey only for single-endpoint discovery.
 */
export async function refreshGrokModelConfig(
  discovery: ModelDiscovery | null,
  options: GrokConfigOptions = {},
): Promise<ModelConfigRefreshResult> {
  const home = options.home ?? homedir()
  if (discovery === null) {
    return {
      ok: false,
      status: "no_discovery",
      discovery: null,
      configUpdate: null,
      modelsBaseUrl: null,
    }
  }
  const agentConfig = options.agentConfig ?? discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const configUpdate = await writeGrokModelConfig(discovery, {
    home,
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    agentConfig,
  })
  return {
    ok: true,
    status: "refreshed",
    discovery,
    configUpdate,
    modelsBaseUrl: configUpdate.modelsBaseUrl,
  }
}

function modelsBaseUrl(discovery: ModelDiscovery): string {
  return discovery.modelsUrl.endsWith("/models") ? discovery.modelsUrl.slice(0, -"/models".length) : discovery.baseUrl
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return ""
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
