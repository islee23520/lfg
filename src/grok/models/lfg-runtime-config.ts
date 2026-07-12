import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import type { ReasoningLevel } from "../../cli/models/lfg-models"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap } from "../agents/lazycodex-agent-overrides"
import { DEFAULT_CODING_TOOL_ADAPTER, normalizeCodingToolAdapterId, type CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import { stripJsonComments } from "../config/json-comments"

const ReasoningLevelSchema = z.union([z.literal("low"), z.literal("medium"), z.literal("high"), z.literal("xhigh")])
const RuntimeFallbackStatusSchema = z.union([z.literal(408), z.literal(409), z.literal(425), z.literal(429), z.literal(500), z.literal(502), z.literal(503), z.literal(504), z.literal(529)])

const LfgRuntimeFallbackModelSchema = z.union([
  z.string().min(1),
  z
    .object({
      model: z.string().min(1),
      variant: ReasoningLevelSchema.optional(),
    })
    .strip(),
])

const LfgRuntimeRouteSchema = z
  .object({
    model: z.string().min(1),
    variant: ReasoningLevelSchema.optional(),
    fallback_models: z.array(LfgRuntimeFallbackModelSchema).optional(),
  })
  .strip()

export const LfgRuntimeConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1).default(1),
    // Grok-only; coerce legacy values (e.g. pi-agent) to grok.
    coding_tool_adapter: z.preprocess(normalizeCodingToolAdapterId, z.literal("grok")).default(DEFAULT_CODING_TOOL_ADAPTER),
    agents: z.record(z.string(), LfgRuntimeRouteSchema).optional(),
    categories: z.record(z.string(), LfgRuntimeRouteSchema).optional(),
    model_fallback: z.boolean().default(true),
    runtime_fallback: z
      .object({
        enabled: z.boolean().default(true),
        retry_on_errors: z.array(RuntimeFallbackStatusSchema).default([408, 409, 425, 429, 500, 502, 503, 504, 529]),
        max_fallback_attempts: z.number().int().min(1).max(20).default(4),
        cooldown_seconds: z.number().int().min(0).default(15),
        timeout_seconds: z.number().int().min(0).default(120),
        notify_on_fallback: z.boolean().default(true),
      })
      .strip()
      .optional(),
    experimental: z
      .object({
        model_fallback_title: z.boolean().default(true),
      })
      .strip()
      .optional(),
    team_mode: z
      .object({
        enabled: z.boolean().default(true),
      })
      .strip()
      .optional(),
  })
  .strip()

export type LfgRuntimeConfig = z.infer<typeof LfgRuntimeConfigSchema>

export const LFG_RUNTIME_CONFIG_FILENAME = "lfg.json" as const

const CATEGORY_ROUTE_NAMES = new Set([
  "visual-engineering",
  "ultrabrain",
  "deep",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
])

export function lfgRuntimeConfigPath(home: string): string {
  return join(home, ".grok", LFG_RUNTIME_CONFIG_FILENAME)
}

export async function readLfgRuntimeConfigFile(home: string): Promise<LfgRuntimeConfig | null> {
  try {
    const raw = await readFile(lfgRuntimeConfigPath(home), "utf8")
    return LfgRuntimeConfigSchema.parse(JSON.parse(stripJsonComments(raw)))
  } catch {
    return null
  }
}

export function applyLfgRuntimeConfigToAgentOverrides(
  base: LazycodexAgentOverrideMap,
  config: LfgRuntimeConfig | null,
): LazycodexAgentOverrideMap {
  const merged: Record<string, LazycodexAgentModelOverride> = { ...base }
  for (const [name, route] of Object.entries({ ...(config?.agents ?? {}), ...(config?.categories ?? {}) })) {
    const existing = merged[name]
    merged[name] = runtimeRouteToOverride(route, existing)
  }
  return merged
}

export function renderDefaultLfgRuntimeConfig(
  seed: LazycodexAgentOverrideMap,
  codingToolAdapter: CodingToolAdapterId = DEFAULT_CODING_TOOL_ADAPTER,
): string {
  const agents: Record<string, unknown> = {}
  const categories: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(seed)) {
    const target = CATEGORY_ROUTE_NAMES.has(name) ? categories : agents
    target[name] = runtimeRouteFromOverride(value)
  }
  return `${JSON.stringify({
    version: 1,
    coding_tool_adapter: codingToolAdapter,
    agents,
    categories,
    model_fallback: true,
    runtime_fallback: {
      enabled: true,
      retry_on_errors: [408, 409, 425, 429, 500, 502, 503, 504, 529],
      max_fallback_attempts: 4,
      cooldown_seconds: 15,
      timeout_seconds: 120,
      notify_on_fallback: true,
    },
    experimental: { model_fallback_title: true },
    team_mode: { enabled: true },
  }, null, 2)}\n`
}

function runtimeRouteToOverride(
  route: z.infer<typeof LfgRuntimeRouteSchema>,
  existing: LazycodexAgentModelOverride | undefined,
): LazycodexAgentModelOverride {
  const fallback = firstFallback(route.fallback_models)
  const fallbackLevel = fallback?.variant ?? existing?.modelFallbackReasoningLevel
  return {
    model: stripProviderPrefix(route.model),
    reasoningLevel: route.variant ?? existing?.reasoningLevel ?? "medium",
    ...(existing?.serviceTier !== undefined ? { serviceTier: existing.serviceTier } : {}),
    ...(fallback?.model !== undefined ? { modelFallback: stripProviderPrefix(fallback.model) } : existing?.modelFallback !== undefined ? { modelFallback: existing.modelFallback } : {}),
    ...(fallbackLevel !== undefined ? { modelFallbackReasoningLevel: fallbackLevel } : {}),
    ...(existing?.modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier: existing.modelFallbackServiceTier } : {}),
  }
}

function firstFallback(fallbacks: readonly z.infer<typeof LfgRuntimeFallbackModelSchema>[] | undefined): { readonly model: string; readonly variant?: ReasoningLevel } | undefined {
  const first = fallbacks?.[0]
  if (first === undefined) return undefined
  if (typeof first === "string") return { model: first }
  return first
}

function runtimeRouteFromOverride(value: LazycodexAgentModelOverride): Record<string, unknown> {
  return {
    model: providerModel(value.model),
    variant: value.reasoningLevel,
    ...(value.modelFallback !== undefined
      ? {
          fallback_models: [{
            model: providerModel(value.modelFallback),
            ...(value.modelFallbackReasoningLevel !== undefined ? { variant: value.modelFallbackReasoningLevel } : {}),
          }],
        }
      : {}),
  }
}

function stripProviderPrefix(model: string): string {
  const slash = model.indexOf("/")
  return slash === -1 ? model : model.slice(slash + 1)
}

function providerModel(model: string): string {
  if (model.includes("/")) return model
  // Vanilla Grok / grok-build or explicit Grok models: keep native for GrokBuild auth.
  if (isGrokNativeModel(model)) return model
  // Proxy-resolved non-Grok ids (e.g. "gpt-5.5") get the cliproxy/ prefix for routing.
  return `cliproxy/${model}`
}

function isGrokNativeModel(model: string): boolean {
  const m = model.toLowerCase()
  return m === "grok-build" || /^grok[-_]/.test(m) || /^grok\b/.test(m)
}
