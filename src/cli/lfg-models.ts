import { isRecord, type JsonObject } from "./lfg-json"
import { aliasGroupKey, loadPublicLiteLLMContextMap } from "./lfg-model-context-catalog"
import { extractContextWindows, extractModelFeatureMetadata, resolveReasoningEffortForModel, type ModelFeatureMetadata } from "./lfg-model-metadata"
import type { LazycodexAgentOverrideMap, ServiceTier } from "../grok-adapter/lazycodex-agent-overrides"
import { normalizeModelIdForConfig } from "../grok-adapter/model-id-safety"

export type ModelMapping = {
  readonly default: string
  readonly fast: string
  readonly reasoning: string
  readonly coding: string
}

export type ReasoningLevel = "low" | "medium" | "high" | "xhigh"
export type SetupPreset = "grok" | "gpt"

export type LazycodexAgentName = "explorer" | "reasoning" | "coding"

export type LazycodexAgentSetting = {
  readonly model: string
  readonly reasoningLevel: ReasoningLevel
  /** Grok routes by model id; tier choice maps here for Lazycodex/Codex parity metadata. */
  readonly serviceTier?: ServiceTier
}

export type LazycodexAgentConfig = Readonly<Record<LazycodexAgentName, LazycodexAgentSetting>>

export type ModelDiscovery = {
  readonly baseUrl: string
  readonly modelsUrl: string
  readonly modelIds: readonly string[]
  readonly mapping: ModelMapping
  readonly preset?: SetupPreset
  readonly agentConfig?: LazycodexAgentConfig
  /** Per-agent overrides (LFP-style); persisted to ~/.grok/lazycodex-agent-overrides.json on install. */
  readonly agentOverrideMap?: LazycodexAgentOverrideMap
  /** Model id → context window size (in tokens).
   * Primary source: values advertised by the local proxy in /v1/models (context_window, max_model_len, max_input_tokens, etc.).
   * Secondary source (best-effort): public LiteLLM model spec catalog (https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json)
   *   matched by exact id or normalized alias. Local/proxy values always win over public catalog.
   * Used by writeGrokModelConfig to populate context_window under each [model.*] so Grok's auto-compact uses the right budget per model.
   */
  readonly contextWindows?: Readonly<Record<string, number>>
  readonly modelFeatureMetadata?: Readonly<Record<string, ModelFeatureMetadata>>
}

export class ModelDiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelDiscoveryError"
  }
}

export function modelDiscoveryPlan(): JsonObject {
  return {
    required: false,
    endpoint: "OpenAI-compatible /v1/models",
    prompt: "OpenAI-compatible base URL (optional — auto from ~/.grok/config.toml or http://127.0.0.1:8317/v1)",
    autoSources: ["--base-url", "LFG_GROK_BASE_URL", "[endpoints].models_base_url", "default_proxy"],
    presets: ["grok", "gpt"],
    defaultPreset: "grok",
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
  const localContextWindows = extractContextWindows(payload) ?? {}
  const contextWindows: Record<string, number> = { ...localContextWindows }
  const modelFeatureMetadata = extractModelFeatureMetadata(payload)
  const modelsMissingContextWindow = modelIds.filter((id) => contextWindows[id] == null)

  // Always attempt to enrich from the public LiteLLM model spec catalog (best-effort, ~4.5s timeout).
  // This pulls max_input_tokens (preferred) or max_tokens for widely known models.
  // Local/proxy-advertised values (from the /v1/models response) always win for the same model id.
  // The goal is to stop everything defaulting to Grok's 200k when the user's OpenAI-compatible proxy
  // does not emit context sizes itself.
  try {
    const publicMap = modelsMissingContextWindow.length === 0 ? {} : await loadPublicLiteLLMContextMap()
    if (publicMap && Object.keys(publicMap).length > 0) {
      for (const id of modelsMissingContextWindow) {
        if (contextWindows[id] != null) continue // local wins
        const direct = publicMap[id]
        if (typeof direct === "number" && direct > 0) {
          contextWindows[id] = direct
          continue
        }
        const norm = aliasGroupKey(id)
        const byNorm = publicMap[norm]
        if (typeof byNorm === "number" && byNorm > 0) {
          contextWindows[id] = byNorm
          continue
        }
        // try stripping provider prefix, e.g. "openai/gpt-5.5" or "anthropic/claude-..."
        const last = id.includes("/") ? id.split("/").pop()! : id
        const norm2 = aliasGroupKey(last)
        const byLast = publicMap[norm2]
        if (typeof byLast === "number" && byLast > 0) {
          contextWindows[id] = byLast
        }
      }
    }
  } catch {
    // silent; public catalog is only a best-effort enrichment
  }

  const finalContextWindows: Readonly<Record<string, number>> | undefined =
    Object.keys(contextWindows).length === 0 ? undefined : contextWindows

  return {
    baseUrl,
    modelsUrl,
    modelIds,
    mapping: mapModels(modelIds),
    contextWindows: finalContextWindows,
    ...(modelFeatureMetadata === undefined ? {} : { modelFeatureMetadata }),
  }
}

export function modelDiscoveryEnv(discovery: ModelDiscovery | null, agentConfig: LazycodexAgentConfig | null = null): Readonly<Record<string, string>> {
  if (discovery === null) {
    return {}
  }
  const agents = agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const env: Record<string, string> = {
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
    OMO_OPENAI_BASE_URL: discovery.baseUrl,
    OMO_OPENAI_MODELS: discovery.modelIds.join(","),
    OMO_MODEL_DEFAULT: discovery.mapping.default,
    OMO_MODEL_REASONING: discovery.mapping.reasoning,
    OMO_MODEL_MAPPING: JSON.stringify(discovery.mapping),
  }
  if (discovery.contextWindows && Object.keys(discovery.contextWindows).length > 0) {
    env.LAZYCODEX_CONTEXT_WINDOWS = JSON.stringify(discovery.contextWindows)
  }
  return env
}

export function defaultLazycodexAgentConfig(discovery: ModelDiscovery): LazycodexAgentConfig {
  return {
    explorer: {
      model: discovery.mapping.fast,
      reasoningLevel: resolveReasoningEffortForModel(discovery.modelFeatureMetadata, discovery.mapping.fast, "low"),
      serviceTier: "fast",
    },
    reasoning: {
      model: discovery.mapping.reasoning,
      reasoningLevel: resolveReasoningEffortForModel(discovery.modelFeatureMetadata, discovery.mapping.reasoning, "high"),
    },
    coding: {
      model: discovery.mapping.coding,
      reasoningLevel: resolveReasoningEffortForModel(discovery.modelFeatureMetadata, discovery.mapping.coding, "medium"),
    },
  }
}

export function applyModelPreset(discovery: ModelDiscovery, preset: SetupPreset): ModelDiscovery {
  const mapping = preset === "grok" ? grokCenteredMapping(discovery.modelIds) : gptCenteredMapping(discovery.modelIds)
  // preserve contextWindows across preset application
  return { ...discovery, mapping, preset }
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
  return payload.data.flatMap((item: unknown) => (isRecord(item) && typeof item.id === "string" ? [normalizeModelIdForConfig(item.id)] : []))
}

function mapModels(modelIds: readonly string[]): ModelMapping {
  const first = modelIds[0]
  if (typeof first !== "string") {
    throw new ModelDiscoveryError("Cannot map an empty model list")
  }
  return {
    default: findModel(modelIds, ["grok-4.3", "grok-4.20-0309-non-reasoning", "grok-3-mini", "grok-build", "grok-3", "grok", "gpt-5.5", "glm-5.2", "gemini-3-pro"]) ?? canonicalModelFor(modelIds, first),
    fast: findModel(modelIds, ["grok-3-mini-fast", "gpt-5.4-mini-fast", "grok-composer-2.5-fast", "grok-composer", "grok-4.20-0309-non-reasoning", "gemini-3-pro-low", "gpt-5.3-codex-spark", "glm-5-turbo", "mini", "flash", "small", "fast"]) ?? canonicalModelFor(modelIds, first),
    reasoning: findModel(modelIds, ["grok-4.20-0309-reasoning", "grok-4.3", "gpt-5.5", "gpt-5.3-codex-spark", "glm-5.2", "gemini-3-pro-high", "reasoning", "reason", "o1", "o3", "o4", "r1", "grok-4", "gpt-5"]) ?? canonicalModelFor(modelIds, first),
    coding: findModel(modelIds, ["grok-4.20-0309-non-reasoning", "gpt-5.3-codex-spark", "codex-auto-review", "codex", "grok-build", "glm-5-turbo", "gemini-3-pro-low", "code", "coder", "gpt", "grok", "claude"]) ?? canonicalModelFor(modelIds, first),
  }
}

function grokCenteredMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["gpt-5.5", "grok-4.3", "grok-4.20-0309-non-reasoning", "grok-3-mini-fast", "grok-3-mini", "grok-build", "grok"]) ?? fallback.default,
    fast: findModel(modelIds, ["grok-3-mini-fast", "gpt-5.4-mini-fast", "grok-composer-2.5-fast", "grok-composer", "grok-4.20-0309-non-reasoning", "grok-3-mini", "mini", "fast"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["grok-4.20-0309-reasoning", "grok-4.3", "grok-4", "reasoning", "gpt-5.5", "glm-5.2", "gemini-3-pro-high"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["grok-4.20-0309-non-reasoning", "gpt-5.3-codex-spark", "codex-auto-review", "codex", "grok-build", "glm-5-turbo", "gemini-3-pro-low", "grok"]) ?? fallback.coding,
  }
}

function gptCenteredMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["gpt-5.5", "gpt-5.4-mini", "gpt-5", "gpt", "grok-4.3", "glm-5.2", "gemini-3-pro-high"]) ?? fallback.default,
    fast: findModel(modelIds, ["gpt-5.4-mini-fast", "gpt-5.3-codex-spark", "gpt-5.4-mini", "gemini-3-pro-low", "grok-4.20-0309-non-reasoning", "glm-5-turbo", "mini", "fast"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["gpt-5.5", "gpt-5.3-codex-spark", "gpt-5", "grok-4.20-0309-reasoning", "glm-5.2", "gemini-3-pro-high", "reasoning", "o3", "o4"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["gpt-5.3-codex-spark", "gpt-5.3-codex", "codex", "grok-4.20-0309-non-reasoning", "glm-5-turbo", "gemini-3-pro-low", "gpt"]) ?? fallback.coding,
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
