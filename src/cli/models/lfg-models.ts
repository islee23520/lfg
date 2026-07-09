import { isRecord, type JsonObject } from "../../shared/json"
import { aliasGroupKey, loadPublicLiteLLMContextMap } from "./lfg-model-context-catalog"
import { extractContextWindows, extractModelFeatureMetadata, type ModelFeatureMetadata } from "./lfg-model-metadata"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap, ServiceTier } from "../../grok/agents/lazycodex-agent-overrides"
import { normalizeModelIdForConfig } from "../../grok/models/model-id-safety"

export type ModelMapping = {
  readonly default: string
  readonly fast: string
  readonly reasoning: string
  readonly coding: string
}

export type ReasoningLevel = "low" | "medium" | "high" | "xhigh"
export type ReasoningEffortChoice = ReasoningLevel | "auto"
export type SetupPreset = "auto" | "balanced" | "grok" | "gpt" | "gemini" | "glm" | "multi"

export type LazycodexAgentName = "explorer" | "reasoning" | "coding"

export type LazycodexAgentSetting = {
  readonly model: string
  readonly reasoningLevel: ReasoningLevel
  /** Grok routes by model id; tier choice maps here for Lazycodex/Codex parity metadata. */
  readonly serviceTier?: ServiceTier
}

export type LazycodexAgentConfig = Readonly<Record<LazycodexAgentName, LazycodexAgentSetting>>

export type MultiProviderEndpoint = {
  readonly id: string
  readonly baseUrl: string
  readonly modelIds: readonly string[]
}

export type ModelDiscovery = {
  readonly baseUrl: string
  readonly modelsUrl: string
  readonly modelIds: readonly string[]
  readonly mapping: ModelMapping
  readonly preset?: SetupPreset
  readonly providerEndpoints?: readonly MultiProviderEndpoint[]
  readonly agentConfig?: LazycodexAgentConfig
  readonly reasoningEffort?: ReasoningEffortChoice
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
    presets: ["auto", "balanced", "grok", "gpt", "gemini", "glm", "multi"],
    defaultPreset: "auto",
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
  return lazycodexAgentConfigForReasoning(discovery, discovery.reasoningEffort ?? "auto")
}

export function withReasoningEffort(discovery: ModelDiscovery, reasoningEffort: ReasoningEffortChoice): ModelDiscovery {
  const agentConfig = lazycodexAgentConfigForReasoning(discovery, reasoningEffort)
  // Do NOT set agentOverrideMap here. The install path (runGrokInstall) already
  // resolves per-agent overrides from the bundled 26-agent JSON (omo-agent-overrides.json)
  // and applies availability-based model replacement via applyRecommendationsToOverrideMap.
  // Previously, globalPresetAgentOverrides() flattened all 26 agents into just 4 tiers
  // (default/fast/reasoning/coding), destroying the per-agent model routing that the
  // bundled JSON defines (e.g. atlas=claude-sonnet-4-6, metis=claude-sonnet-4-6,
  // writing=gemini-3.1-pro-low, oracle=gpt-5.5). By leaving agentOverrideMap undefined,
  // the install path uses its own richer resolution: bundled per-agent defaults + role
  // config merge + availability checking against discovered modelIds.
  return {
    ...discovery,
    reasoningEffort,
    agentConfig,
  }
}

function lazycodexAgentConfigForReasoning(discovery: ModelDiscovery, reasoningEffort: ReasoningEffortChoice): LazycodexAgentConfig {
  const explorerReasoning = resolveAgentReasoning("low", reasoningEffort)
  const reasoningReasoning = resolveAgentReasoning("high", reasoningEffort)
  const codingReasoning = resolveAgentReasoning("medium", reasoningEffort)
  return {
    explorer: {
      model: discovery.mapping.fast,
      reasoningLevel: explorerReasoning,
      serviceTier: "fast",
    },
    reasoning: {
      model: discovery.mapping.reasoning,
      reasoningLevel: reasoningReasoning,
    },
    coding: {
      model: discovery.mapping.coding,
      reasoningLevel: codingReasoning,
    },
  }
}

function resolveAgentReasoning(fallback: ReasoningLevel, choice: ReasoningEffortChoice): ReasoningLevel {
  // "auto" means "use the role's default reasoning level" — it does NOT read
  // model-advertised reasoning_effort metadata. The previous behavior (trusting
  // whatever a proxy/model reports) produced unpredictable results: e.g. a model
  // advertising "xhigh" would force xhigh onto the coding role. The fixed role
  // defaults (explorer=low, reasoning=high, coding=medium) are the correct values
  // regardless of what a model claims about itself.
  return choice === "auto" ? fallback : choice
}


export function applyModelPreset(discovery: ModelDiscovery, preset: SetupPreset): ModelDiscovery {
  const mapping = presetMapping(discovery.modelIds, preset)
  const providerEndpoints = preset === "multi" ? multiProviderEndpoints(discovery) : discovery.providerEndpoints
  return { ...discovery, mapping, preset, ...(providerEndpoints === undefined ? {} : { providerEndpoints }) }
}

function presetMapping(modelIds: readonly string[], preset: SetupPreset): ModelMapping {
  switch (preset) {
    case "auto":
      return autoBestMapping(modelIds)
    case "balanced":
    case "multi":
      return balancedMapping(modelIds)
    case "grok":
      return grokCenteredMapping(modelIds)
    case "gpt":
      return gptCenteredMapping(modelIds)
    case "gemini":
      return geminiCenteredMapping(modelIds)
    case "glm":
      return glmCenteredMapping(modelIds)
  }
}

function multiProviderEndpoints(discovery: ModelDiscovery): readonly MultiProviderEndpoint[] {
  const groups = new Map<string, string[]>()
  for (const modelId of discovery.modelIds) {
    const provider = providerForModel(modelId)
    const ids = groups.get(provider) ?? []
    ids.push(modelId)
    groups.set(provider, ids)
  }
  return [...groups.entries()].map(([id, modelIds]) => ({ id, baseUrl: providerBaseUrl(id, discovery.baseUrl), modelIds }))
}

function providerForModel(modelId: string): string {
  const explicit = modelId.includes("/") ? modelId.split("/")[0] : null
  if (explicit !== null && explicit.length > 0) return explicit
  const lowered = modelId.toLowerCase()
  if (lowered.startsWith("grok-")) return "xai"
  if (lowered.startsWith("glm-")) return "glm"
  if (lowered.startsWith("gemini-")) return "google"
  if (lowered.startsWith("claude-")) return "anthropic"
  return "openai-compatible"
}

function providerBaseUrl(provider: string, fallbackBaseUrl: string): string {
  if (provider === "xai") return "https://api.x.ai/v1"
  if (provider === "openai") return "https://api.openai.com/v1"
  if (provider === "google") return "https://generativelanguage.googleapis.com/v1beta/openai"
  if (provider === "anthropic") return "https://api.anthropic.com/v1"
  if (provider === "glm") return "https://open.bigmodel.cn/api/paas/v4"
  return fallbackBaseUrl
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
    default: findModel(modelIds, ["grok-4.5", "gpt-5.5", "grok-4.3", "glm-5.2", "gemini-3.1-pro-preview", "gemini-3-pro-preview", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-4", "grok", "grok-build"]) ?? canonicalModelFor(modelIds, first),
    fast: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "grok-3-mini-fast", "gpt-5.4-mini-fast", "grok-4.20-0309-non-reasoning", "gemini-3-pro-low", "glm-5-turbo", "mini", "flash", "small", "fast"]) ?? canonicalModelFor(modelIds, first),
    reasoning: findModel(modelIds, ["grok-4.5", "grok-4.20-0309-reasoning", "grok-4.3", "gpt-5.5", "glm-5.2", "gemini-3-pro-high", "reasoning", "reason", "o1", "o3", "o4", "r1", "grok-4", "gpt-5"]) ?? canonicalModelFor(modelIds, first),
    coding: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "grok-4.20-0309-non-reasoning", "grok-build", "glm-5-turbo", "gemini-3-pro-low", "codex-auto-review", "code", "coder", "gpt", "grok", "claude"]) ?? canonicalModelFor(modelIds, first),
  }
}

function autoBestMapping(modelIds: readonly string[]): ModelMapping {
  const first = modelIds[0]
  if (typeof first !== "string") {
    throw new ModelDiscoveryError("Cannot map an empty model list")
  }
  return {
    default: findModel(modelIds, ["grok-4.5", "grok-build-0.1", "grok-build", "gpt-5.5", "glm-5.2", "gpt-5", "glm", "grok-4.3", "gemini-3.1-pro-preview", "gemini-3-pro-preview", "grok-4.20-0309-reasoning", "grok-4"]) ?? canonicalModelFor(modelIds, first),
    fast: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "gpt-5.4-mini-fast", "gpt-5.4-mini", "glm-5-turbo", "gemini-3-flash", "gemini-3.1-flash-lite", "fast", "mini", "flash", "lite", "turbo", "air", "grok-3-mini-fast"]) ?? canonicalModelFor(modelIds, first),
    reasoning: findModel(modelIds, ["grok-4.5", "gpt-5.5", "glm-5.2", "gpt-5", "glm", "reasoning", "think", "o1", "o3", "o4", "r1", "grok-4.3", "grok-4.20-0309-reasoning", "gemini-3-pro-high", "grok-4"]) ?? canonicalModelFor(modelIds, first),
    coding: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "code", "coder", "coding", "build", "grok-4.20-0309-non-reasoning", "grok-build", "glm-5-turbo", "gpt", "grok"]) ?? canonicalModelFor(modelIds, first),
  }
}

function balancedMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["gpt-5.5", "gpt-5.4", "gpt-5", "grok-4.5", "grok-4.3", "glm-5.2", "gemini-3.1-pro-preview", "gemini-3-pro-preview"]) ?? fallback.default,
    fast: findModel(modelIds, ["gemini-3-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini", "grok-composer-2.5-fast", "grok-3-mini-fast", "gpt-5.4-mini-fast", "flash", "fast", "mini"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["grok-4.5", "grok-4.20-0309-reasoning", "grok-4.3", "glm-5.2", "gpt-5.5", "gemini-3.1-pro-preview", "reasoning", "grok-4"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "grok-4.20-0309-non-reasoning", "grok-build", "glm-5-turbo", "codex-auto-review", "code", "coder"]) ?? fallback.coding,
  }
}

function grokCenteredMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["grok-4.5", "grok-4.3", "grok-4.20-0309-non-reasoning", "grok-3-mini-fast", "grok-3-mini", "grok-build", "grok", "gpt-5.5"]) ?? fallback.default,
    fast: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "grok-3-mini-fast", "grok-4.20-0309-non-reasoning", "grok-3-mini", "mini", "fast", "gemini-3-flash"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["grok-4.5", "grok-4.20-0309-reasoning", "grok-4.3", "grok-4", "reasoning", "gpt-5.5", "glm-5.2", "gemini-3-pro-high"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "grok-4.20-0309-non-reasoning", "grok-build", "grok", "codex-auto-review", "glm-5-turbo", "gemini-3-pro-low"]) ?? fallback.coding,
  }
}

function gptCenteredMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["gpt-5.5", "gpt-5.4-mini", "gpt-5", "gpt", "grok-4.5", "grok-4.3", "glm-5.2", "gemini-3-pro-high"]) ?? fallback.default,
    fast: findModel(modelIds, ["gpt-5.4-mini-fast", "gpt-5.4-mini", "gemini-3-pro-low", "grok-4.20-0309-non-reasoning", "glm-5-turbo", "mini", "fast"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["gpt-5.5", "gpt-5", "grok-4.5", "grok-4.20-0309-reasoning", "glm-5.2", "gemini-3-pro-high", "reasoning", "o3", "o4"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["grok-composer-2.5-fast", "grok-composer", "grok-4.20-0309-non-reasoning", "glm-5-turbo", "gemini-3-pro-low", "gpt"]) ?? fallback.coding,
  }
}

function geminiCenteredMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro", "gemini-pro", "gemini", "gpt-5.5", "grok-4.5", "grok-4.3"]) ?? fallback.default,
    fast: findModel(modelIds, ["gemini-3-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini", "flash", "grok-3-mini-fast"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro", "grok-4.5", "grok-4.20-0309-reasoning", "glm-5.2", "gpt-5.5"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro", "grok-composer-2.5-fast", "grok-4.20-0309-non-reasoning"]) ?? fallback.coding,
  }
}

function glmCenteredMapping(modelIds: readonly string[]): ModelMapping {
  const fallback = mapModels(modelIds)
  return {
    default: findModel(modelIds, ["glm-5.2", "glm-4.7", "glm", "gpt-5.5", "grok-4.5", "grok-4.3"]) ?? fallback.default,
    fast: findModel(modelIds, ["glm-5-turbo", "glm-5v-turbo", "glm-4.5-air", "glm", "gemini-3-flash", "grok-3-mini-fast", "fast"]) ?? fallback.fast,
    reasoning: findModel(modelIds, ["glm-5.2", "grok-4.5", "grok-4.20-0309-reasoning", "gpt-5.5", "reasoning"]) ?? fallback.reasoning,
    coding: findModel(modelIds, ["glm-5-turbo", "glm-5.2", "grok-composer-2.5-fast", "grok-4.20-0309-non-reasoning"]) ?? fallback.coding,
  }
}

function findModel(modelIds: readonly string[], needles: readonly string[]): string | null {
  const candidateIds = modelIds.filter((id) => !isCodexSparkModel(id))
  for (const needle of needles) {
    const needleKey = aliasGroupKey(needle)
    const found =
      candidateIds.find((id) => id.toLowerCase() === needle.toLowerCase()) ??
      candidateIds.find((id) => aliasGroupKey(id) === needleKey) ??
      candidateIds.find((id) => isSubstringMatch(id, needle))
    if (found) {
      return canonicalModelFor(modelIds, found)
    }
  }
  return null
}

function isCodexSparkModel(modelId: string): boolean {
  return /gpt-5\.3.*codex.*spark/i.test(modelId)
}

/** Substring match that avoids false positives from negated model names.
 *  e.g. needle "reasoning" must NOT match "grok-4.20-0309-non-reasoning",
 *  and needle "fast" must NOT match a model with "non-fast" in its id.
 */
function isSubstringMatch(modelId: string, needle: string): boolean {
  const lower = modelId.toLowerCase()
  const pos = lower.indexOf(needle.toLowerCase())
  if (pos === -1) return false
  // Check if the match is preceded by "non-" — if so, it's a negated reference.
  const prefix = lower.slice(Math.max(0, pos - 4), pos)
  return !prefix.endsWith("non-")
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
