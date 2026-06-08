import { isRecord, type JsonObject } from "./lfg-json"

export type ModelMapping = {
  readonly default: string
  readonly fast: string
  readonly reasoning: string
  readonly coding: string
}

export type ReasoningLevel = "low" | "medium" | "high" | "xhigh"

export type LazycodexAgentName = "explorer" | "reasoning" | "coding"

export type LazycodexAgentSetting = {
  readonly model: string
  readonly reasoningLevel: ReasoningLevel
}

export type LazycodexAgentConfig = Readonly<Record<LazycodexAgentName, LazycodexAgentSetting>>

export type ModelDiscovery = {
  readonly baseUrl: string
  readonly modelsUrl: string
  readonly modelIds: readonly string[]
  readonly mapping: ModelMapping
  readonly agentConfig?: LazycodexAgentConfig
}

export class ModelDiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelDiscoveryError"
  }
}

export function modelDiscoveryPlan(): JsonObject {
  return {
    required: true,
    endpoint: "OpenAI-compatible /v1/models",
    prompt: "OpenAI-compatible base URL",
  }
}

export async function fetchModelDiscovery(inputBaseUrl: string): Promise<ModelDiscovery> {
  const { baseUrl, modelsUrl } = normalizeModelUrls(inputBaseUrl)
  const response = await fetch(modelsUrl, { headers: modelRequestHeaders() })
  if (!response.ok) {
    throw new ModelDiscoveryError(`Failed to fetch ${modelsUrl}: HTTP ${response.status}`)
  }
  const payload: unknown = await response.json()
  const modelIds = extractModelIds(payload)
  if (modelIds.length === 0) {
    throw new ModelDiscoveryError(`No model ids found in ${modelsUrl}`)
  }
  return {
    baseUrl,
    modelsUrl,
    modelIds,
    mapping: mapModels(modelIds),
  }
}

export function modelDiscoveryEnv(discovery: ModelDiscovery | null, agentConfig: LazycodexAgentConfig | null = null): Readonly<Record<string, string>> {
  if (discovery === null) {
    return {}
  }
  const agents = agentConfig ?? defaultLazycodexAgentConfig(discovery)
  return {
    LAZYCODEX_OPENAI_BASE_URL: discovery.baseUrl,
    LAZYCODEX_OPENAI_MODELS: discovery.modelIds.join(","),
    LAZYCODEX_MODEL_DEFAULT: discovery.mapping.default,
    LAZYCODEX_MODEL_FAST: discovery.mapping.fast,
    LAZYCODEX_MODEL_REASONING: discovery.mapping.reasoning,
    LAZYCODEX_MODEL_CODING: discovery.mapping.coding,
    LAZYCODEX_MODEL_MAPPING: JSON.stringify(discovery.mapping),
    LAZYCODEX_AGENT_CONFIG: JSON.stringify(agents),
    LAZYCODEX_AGENT_EXPLORER_MODEL: agents.explorer.model,
    LAZYCODEX_AGENT_EXPLORER_REASONING_LEVEL: agents.explorer.reasoningLevel,
    LAZYCODEX_AGENT_REASONING_MODEL: agents.reasoning.model,
    LAZYCODEX_AGENT_REASONING_REASONING_LEVEL: agents.reasoning.reasoningLevel,
    LAZYCODEX_AGENT_CODING_MODEL: agents.coding.model,
    LAZYCODEX_AGENT_CODING_REASONING_LEVEL: agents.coding.reasoningLevel,
  }
}

export function defaultLazycodexAgentConfig(discovery: ModelDiscovery): LazycodexAgentConfig {
  return {
    explorer: { model: discovery.mapping.default, reasoningLevel: "medium" },
    reasoning: { model: discovery.mapping.reasoning, reasoningLevel: "high" },
    coding: { model: discovery.mapping.coding, reasoningLevel: "medium" },
  }
}

function normalizeModelUrls(inputBaseUrl: string): { readonly baseUrl: string; readonly modelsUrl: string } {
  const trimmed = inputBaseUrl.trim()
  if (trimmed.length === 0) {
    throw new ModelDiscoveryError("OpenAI-compatible base URL is required")
  }
  const base = parseUrl(trimmed)
  base.hash = ""
  base.search = ""
  const path = base.pathname.replace(/\/+$/, "")
  const normalizedPath = path === "" ? "" : path
  const baseUrl = `${base.origin}${normalizedPath}`
  const models = new URL(baseUrl)
  if (normalizedPath.endsWith("/models")) {
    return { baseUrl: baseUrl.slice(0, -"/models".length), modelsUrl: models.toString() }
  }
  models.pathname = normalizedPath.endsWith("/v1") ? `${normalizedPath}/models` : `${normalizedPath}/v1/models`
  return { baseUrl, modelsUrl: models.toString() }
}

function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch (error) {
    if (error instanceof Error) {
      throw new ModelDiscoveryError(`Invalid OpenAI-compatible base URL: ${value}`)
    }
    throw error
  }
}

function modelRequestHeaders(): Readonly<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY
  return typeof apiKey === "string" && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {}
}

function extractModelIds(payload: unknown): readonly string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new ModelDiscoveryError("Model list response must be an object with a data array")
  }
  return payload.data.flatMap((item: unknown) => (isRecord(item) && typeof item.id === "string" ? [item.id] : []))
}

function mapModels(modelIds: readonly string[]): ModelMapping {
  const first = modelIds[0]
  if (typeof first !== "string") {
    throw new ModelDiscoveryError("Cannot map an empty model list")
  }
  return {
    default: findModel(modelIds, ["grok-3-mini", "grok-build", "grok-3", "grok"]) ?? canonicalModelFor(modelIds, first),
    fast: findModel(modelIds, ["mini", "flash", "small", "fast"]) ?? canonicalModelFor(modelIds, first),
    reasoning: findModel(modelIds, ["grok-4.20-0309-reasoning", "reasoning", "reason", "o1", "o3", "o4", "r1", "grok-4", "gpt-5"]) ?? canonicalModelFor(modelIds, first),
    coding: findModel(modelIds, ["codex-auto-review", "codex", "code", "coder", "gpt", "grok", "claude"]) ?? canonicalModelFor(modelIds, first),
  }
}

function findModel(modelIds: readonly string[], needles: readonly string[]): string | null {
  for (const needle of needles) {
    const needleKey = aliasGroupKey(needle)
    const found =
      modelIds.find((id) => id.toLowerCase() === needle.toLowerCase()) ??
      modelIds.find((id) => aliasGroupKey(id) === needleKey) ??
      modelIds.find((id) => id.toLowerCase().includes(needle))
    if (found) {
      return canonicalModelFor(modelIds, found)
    }
  }
  return null
}

function canonicalModelFor(modelIds: readonly string[], modelId: string): string {
  const groupKey = aliasGroupKey(modelId)
  const candidates = modelIds.filter((id) => aliasGroupKey(id) === groupKey)
  const exactNormalized = candidates.find((id) => id === groupKey)
  if (exactNormalized) {
    return exactNormalized
  }
  return candidates.find((id) => id === id.toLowerCase() && !/\s/.test(id)) ?? candidates[0] ?? modelId
}

function aliasGroupKey(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
