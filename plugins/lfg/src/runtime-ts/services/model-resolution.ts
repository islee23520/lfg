import { join } from "node:path"
import { resolveModel as resolveCoreModel, resolveModelWithFallback as resolveCoreModelWithFallback } from "@oh-my-opencode/model-core"
import { resolveLfgEnv, type LfgEnv } from "../foundation/env"
import { loadOmoAgentRegistry, type OmoAgent } from "./agent-registry"

export type ModelProvider = "openai" | "xai" | "grok" | "codex" | "copilot" | "zai"
export type CanonicalModelProvider = "openai" | "xai" | "codex" | "copilot" | "zai"
export type ReasoningLevel = "low" | "medium" | "high" | "xhigh"
export type ModelProfile = { provider: string; model: string; reasoning: ReasoningLevel | string }
export type CategoryName = keyof typeof OMO_CATEGORY_MODEL_PROFILES
export type ModelResolutionSuccess = { ok: true; modelProfile: ModelProfile; modelResolution: ModelResolutionPolicy }
export type ModelResolutionFailure = Record<string, unknown> & { ok: false; error: string; status?: string }
export type ModelResolutionResult = ModelResolutionSuccess | ModelResolutionFailure
export type ModelResolutionPolicy = {
  roleFit: string
  reason: string
  selectedBy: string
  selectedModelProfile: ModelProfile
  fallbackChainSource: string
  proactiveFallbackChain: ModelProfile[]
  runtimeFallback: typeof OMO_RUNTIME_FALLBACK_POLICY
  providerBoundary: { approvedProviders: string[]; source: string }
  modelFamilyPolicy?: Record<string, unknown>
  modelCore?: Record<string, unknown>
}

export const APPROVED_MODEL_PROVIDERS = new Set<ModelProvider>(["openai", "xai", "grok", "codex", "copilot", "zai"])
export const MODEL_PROVIDER_ALIASES: Record<string, CanonicalModelProvider> = { grok: "xai", "github-copilot": "copilot", "zai-coding-plan": "zai" }
export const PROVIDER_DEFAULT_MODELS: Record<CanonicalModelProvider, string> = { openai: "openai/gpt-5.5", xai: "xai/grok-4.3", codex: "openai-codex", copilot: "github-copilot", zai: "zai-coding-plan" }
export const HEPHAESTUS_APPROVED_MODEL_PROFILES: readonly ModelProfile[] = [
  { provider: "openai", model: "openai/gpt-5.5", reasoning: "medium" },
  { provider: "copilot", model: "github-copilot/gpt-5.5", reasoning: "medium" },
] as const
export const OMO_CATEGORY_MODEL_PROFILES = {
  quick: { provider: "xai", model: "xai/grok-4.3", reasoning: "low" },
  "unspecified-low": { provider: "xai", model: "xai/grok-4.3", reasoning: "medium" },
  "unspecified-high": { provider: "xai", model: "xai/grok-4.3", reasoning: "high" },
  ultrabrain: { provider: "xai", model: "xai/grok-4.3", reasoning: "high" },
  artistry: { provider: "xai", model: "xai/grok-4.3", reasoning: "high" },
  deep: { provider: "xai", model: "xai/grok-4.3", reasoning: "xhigh" },
  writing: { provider: "xai", model: "xai/grok-4.3", reasoning: "medium" },
  "visual-engineering": { provider: "xai", model: "xai/grok-4.3", reasoning: "high" },
  planning: { provider: "xai", model: "xai/grok-4.3", reasoning: "high" },
  policy: { provider: "xai", model: "xai/grok-4.3", reasoning: "low" },
  configuration: { provider: "xai", model: "xai/grok-4.3", reasoning: "low" },
} as const satisfies Record<string, ModelProfile>
export const OMO_UPSTREAM_CATEGORY_NAMES = ["visual-engineering", "artistry", "ultrabrain", "deep", "quick", "unspecified-low", "unspecified-high", "writing", "quick-rust", "quick-zig", "git"] as const
export const OMO_LFG_SUPPORTED_CATEGORY_NAMES = ["visual-engineering", "artistry", "ultrabrain", "deep", "quick", "unspecified-low", "unspecified-high", "writing"] as const
export const OMO_CATEGORY_MIGRATION_NOTES: Record<string, string> = {
  "quick-rust": "quick-rust is an upstream OMO category but is not routed by LFG yet; use quick until the migration slice lands.",
  "quick-zig": "quick-zig is an upstream OMO category but is not routed by LFG yet; use quick until the migration slice lands.",
  git: "git is an upstream OMO category but is not routed by LFG yet; use quick or planning until the migration slice lands.",
}
export const OMO_RUNTIME_FALLBACK_POLICY = { kind: "runtime-fallback", source: "docs/reference.md:57-62", status: "fallback_manual_gate", trigger: "reactive recovery when native Grok sub-agent spawning is unavailable or execution fails", separateFromProactiveSelection: true, manualGateRequired: true } as const
export const OMO_MODEL_MATCHING_SOURCE = "agent-model-matching.md:141-149,202-243,311-325 adapted through docs/reference.md:49-59 and T6 provider metadata boundaries"
export const OMO_REASONING_LEVELS = new Set<ReasoningLevel>(["low", "medium", "high", "xhigh"])
export const OMO_AGENT_ROLE_FIT: Record<string, string> = { sisyphus: "communicator", "sisyphus-junior": "communicator", prometheus: "dual-prompt", atlas: "dual-prompt", hephaestus: "deep-specialist", oracle: "deep-specialist", metis: "dual-prompt", momus: "deep-specialist", explore: "utility-runner", librarian: "utility-runner", "multimodal-looker": "visual-artistry", "builtin-agents": "policy-layer" }
export const OMO_CATEGORY_ROLE_FIT: Record<string, string> = { "visual-engineering": "visual-artistry", artistry: "visual-artistry", ultrabrain: "deep-specialist", deep: "deep-specialist", quick: "utility-runner", "unspecified-high": "communicator", "unspecified-low": "communicator", writing: "communicator", planning: "dual-prompt", policy: "policy-layer", configuration: "policy-layer" }
export const OMO_ROLE_FIT_POLICIES: Record<string, { reason: string; fallbackChainSource: string; fallbackChain: ModelProfile[] }> = {
  communicator: { reason: "communicator/orchestrator role: preserve OMO's instruction-following coordination semantics with Grok-first execution and approved optional lanes only", fallbackChainSource: OMO_MODEL_MATCHING_SOURCE, fallbackChain: [{ provider: "xai", model: "xai/grok-4.3", reasoning: "high" }, { provider: "copilot", model: "github-copilot/gpt-5.5", reasoning: "medium" }] },
  "dual-prompt": { reason: "dual-prompt planner/checklist role: keep OMO's Claude/GPT prompt-family distinction while selecting a Grok-first high-reasoning profile", fallbackChainSource: OMO_MODEL_MATCHING_SOURCE, fallbackChain: [{ provider: "xai", model: "xai/grok-4.3", reasoning: "high" }, { provider: "copilot", model: "github-copilot/gpt-5.5", reasoning: "high" }] },
  "deep-specialist": { reason: "deep specialist role: match OMO's principle-driven autonomous coding semantics with approved GPT-style profiles; Hephaestus must not silently downgrade to cheap or utility models", fallbackChainSource: OMO_MODEL_MATCHING_SOURCE, fallbackChain: [{ provider: "openai", model: "openai/gpt-5.5", reasoning: "medium" }, { provider: "copilot", model: "github-copilot/gpt-5.5", reasoning: "medium" }] },
  "visual-artistry": { reason: "visual/artistry role: preserve OMO's visual reasoning distinction with a high-reasoning Grok profile and approved bounded Z.ai consultation lane", fallbackChainSource: OMO_MODEL_MATCHING_SOURCE, fallbackChain: [{ provider: "xai", model: "xai/grok-4.3", reasoning: "high" }, { provider: "zai", model: "zai-coding-plan/glm-5", reasoning: "medium" }] },
  "utility-runner": { reason: "utility runner role: favor bounded fast search/retrieval semantics instead of upgrading every role to one deep profile", fallbackChainSource: OMO_MODEL_MATCHING_SOURCE, fallbackChain: [{ provider: "xai", model: "xai/grok-4.3", reasoning: "low" }, { provider: "zai", model: "zai-coding-plan/glm-5", reasoning: "low" }] },
  "policy-layer": { reason: "policy/configuration role: keep builtin-agents cheap and deterministic while exposing the model resolver contract", fallbackChainSource: OMO_MODEL_MATCHING_SOURCE, fallbackChain: [{ provider: "xai", model: "xai/grok-4.3", reasoning: "low" }] },
}

export type ResolveOmoModelProfileOptions = { category?: string; provider?: string; model?: string; reasoning?: string; currentModelSelection?: Record<string, unknown> }

export function canonicalModelProvider(provider: string): string {
  return MODEL_PROVIDER_ALIASES[provider] ?? provider
}

export async function resolveOmoModelProfile(agentOrId: OmoAgent | string, options: ResolveOmoModelProfileOptions = {}, env: LfgEnv = resolveLfgEnv()): Promise<ModelResolutionResult> {
  const agent = typeof agentOrId === "string" ? (await loadOmoAgentRegistry(join(env.root, "src", "agents"))).find((candidate) => candidate.id === agentOrId) : agentOrId
  if (!agent) return { ok: false, error: "unknown OMO agent", agent: agentOrId }
  return resolveModelProfile(agent, options)
}

export function resolveModelProfile(agent: OmoAgent, options: ResolveOmoModelProfileOptions = {}): ModelResolutionResult {
  const boundaryError = validateModelProviderBoundary(options.provider, options.model)
  if (boundaryError) return boundaryError
  let profile: ModelProfile
  let selectedBy: string
  const category = options.category
  if (category && agent.id === "hephaestus") {
    profile = { ...agent.modelProfile }
    selectedBy = "hephaestus-approved-default"
  } else if (category) {
    if (category in OMO_CATEGORY_MIGRATION_NOTES) return { ok: false, error: "category not yet supported by LFG", category, migrationNote: OMO_CATEGORY_MIGRATION_NOTES[category], upstreamCategories: [...OMO_UPSTREAM_CATEGORY_NAMES], supportedCategories: [...OMO_LFG_SUPPORTED_CATEGORY_NAMES] }
    if (!(category in OMO_CATEGORY_MODEL_PROFILES)) return { ok: false, error: "unknown OMO category", category, known: Object.keys(OMO_CATEGORY_MODEL_PROFILES).sort(), upstreamCategories: [...OMO_UPSTREAM_CATEGORY_NAMES] }
    if (!agent.categories.includes(category)) return { ok: false, error: "category not supported for agent", agent: agent.id, category, supported: agent.categories, upstreamCategories: [...OMO_UPSTREAM_CATEGORY_NAMES], supportedCategories: [...OMO_LFG_SUPPORTED_CATEGORY_NAMES] }
    profile = { ...OMO_CATEGORY_MODEL_PROFILES[category as CategoryName] }
    selectedBy = "category"
  } else {
    profile = { ...agent.modelProfile }
    selectedBy = "agent"
  }
  if (options.provider) {
    const provider = canonicalModelProvider(options.provider)
    profile.provider = provider
    profile.model = options.model ?? PROVIDER_DEFAULT_MODELS[provider as CanonicalModelProvider]
    selectedBy = "provider-override"
  }
  if (options.model) {
    profile.model = options.model
    if (selectedBy === "agent") selectedBy = "model-override"
  }
  if (options.reasoning) {
    if (!OMO_REASONING_LEVELS.has(options.reasoning as ReasoningLevel)) return { ok: false, error: "unknown Grok reasoning level", reasoning: options.reasoning, known: [...OMO_REASONING_LEVELS].sort() }
    profile.reasoning = options.reasoning
  }
  const coreResolution = resolveWithOmoModelCore(profile, options)
  profile = coreResolution.profile
  const policy = modelResolutionPolicy(agent, category, profile, selectedBy)
  policy.modelCore = coreResolution.provenance
  if (agent.id === "hephaestus") {
    const family = hephaestusModelFamilyStatus(profile)
    policy.modelFamilyPolicy = family
    if (family.approved !== true) return { ok: false, status: "blocked", error: "model-family mismatch", message: "Hephaestus requires an approved GPT-style deep-specialist profile; refusing mismatched cheap, utility, or non-GPT model activation.", modelFamilyPolicy: family, modelResolution: policy }
  }
  return { ok: true, modelProfile: profile, modelResolution: policy }
}

export function validateModelProviderBoundary(provider?: string, model?: string): ModelResolutionFailure | null {
  const selectedProvider = provider ? canonicalModelProvider(provider) : undefined
  if (provider && !APPROVED_MODEL_PROVIDERS.has(provider as ModelProvider)) return { ok: false, error: "unsupported model provider for LFG multi-provider OMO agents", provider, known: [...APPROVED_MODEL_PROVIDERS].sort() }
  if (selectedProvider && !APPROVED_MODEL_PROVIDERS.has(selectedProvider as ModelProvider)) return { ok: false, error: "unsupported model provider for LFG multi-provider OMO agents", provider, known: [...APPROVED_MODEL_PROVIDERS].sort() }
  if (model?.includes("/")) {
    const raw = model.split("/", 1)[0]
    const canonical = canonicalModelProvider(raw)
    if (!APPROVED_MODEL_PROVIDERS.has(canonical as ModelProvider)) return { ok: false, error: "unsupported model provider in model override", provider: raw, model, known: [...APPROVED_MODEL_PROVIDERS].sort() }
    if (selectedProvider && selectedProvider !== canonical) return { ok: false, error: "model override provider does not match selected provider", provider, modelProvider: raw, model }
  }
  return null
}

export function hephaestusModelFamilyStatus(profile: ModelProfile): Record<string, unknown> {
  const provider = canonicalModelProvider(profile.provider)
  const approved = HEPHAESTUS_APPROVED_MODEL_PROFILES.some((item) => item.provider === provider && item.model === profile.model)
  return { agent: "hephaestus", requiredFamily: "GPT-style deep specialist", approved, approvedProfiles: HEPHAESTUS_APPROVED_MODEL_PROFILES.map((item) => ({ ...item })), selectedProfile: { ...profile }, source: "agent-model-matching.md:224-232" }
}

export function modelResolutionPolicy(agent: OmoAgent, category: string | undefined, profile: ModelProfile, selectedBy: string): ModelResolutionPolicy {
  const roleFit = agent.id === "hephaestus" ? OMO_AGENT_ROLE_FIT[agent.id] ?? "communicator" : OMO_CATEGORY_ROLE_FIT[category ?? ""] ?? OMO_AGENT_ROLE_FIT[agent.id] ?? "communicator"
  const policy = OMO_ROLE_FIT_POLICIES[roleFit] ?? OMO_ROLE_FIT_POLICIES.communicator
  return { roleFit, reason: policy.reason, selectedBy, selectedModelProfile: { ...profile }, fallbackChainSource: policy.fallbackChainSource, proactiveFallbackChain: policy.fallbackChain.map((item) => ({ ...item })), runtimeFallback: { ...OMO_RUNTIME_FALLBACK_POLICY }, providerBoundary: { approvedProviders: [...APPROVED_MODEL_PROVIDERS].sort(), source: "docs/reference.md and approved-only external provider contract" } }
}

function resolveWithOmoModelCore(profile: ModelProfile, options: ResolveOmoModelProfileOptions): { profile: ModelProfile; provenance: Record<string, unknown> } {
  const userModel = options.model ?? options.currentModelSelection?.model
  const inheritedModel = typeof options.currentModelSelection?.model === "string" ? options.currentModelSelection.model : undefined
  const systemDefault = profile.model
  const basicResolved = resolveCoreModel({ userModel: typeof userModel === "string" ? userModel : undefined, inheritedModel, systemDefault }) ?? systemDefault
  const fallbackChain = Object.values(OMO_ROLE_FIT_POLICIES).flatMap((policy) => policy.fallbackChain).map((item) => ({ providers: [canonicalModelProvider(item.provider)], model: stripProviderPrefix(item.model), variant: item.reasoning }))
  const availableModels = new Set<string>([
    basicResolved,
    profile.model,
    ...Object.values(PROVIDER_DEFAULT_MODELS),
    ...Object.values(OMO_CATEGORY_MODEL_PROFILES).map((item) => item.model),
    ...fallbackChain.flatMap((item) => [item.model, ...item.providers.map((provider) => `${provider}/${item.model}`)]),
  ])
  const resolved = resolveCoreModelWithFallback({ userModel: basicResolved, categoryDefaultModel: profile.model, fallbackChain, availableModels, systemDefaultModel: systemDefault })
  const selectedModel = resolved?.model ?? basicResolved
  const provider = selectedModel.includes("/") ? canonicalModelProvider(selectedModel.split("/", 1)[0] ?? profile.provider) : profile.provider
  return {
    profile: { ...profile, provider, model: selectedModel, reasoning: resolved?.variant ?? profile.reasoning },
    provenance: { package: "@oh-my-opencode/model-core", basicResolved, resolved: resolved ?? null },
  }
}

function stripProviderPrefix(model: string): string {
  return model.includes("/") ? model.slice(model.indexOf("/") + 1) : model
}
