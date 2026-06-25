import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAgentConfig, LazycodexAgentSetting, ReasoningLevel } from "../../cli/models/lfg-models"
import { applyLfgConfigToAgentOverrides, applyLfgRuntimeConfigToAgentOverrides, readLfgConfigFile, readLfgRuntimeConfigFile } from "../config/lfg-config"
import { resolveFlavourPackAssetsRoot } from "../payload/resolve-flavour-pack-asset"

export type ServiceTier = "default" | "fast"

export type LazycodexAgentModelOverride = {
  readonly model: string
  readonly reasoningLevel: ReasoningLevel
  readonly serviceTier?: ServiceTier
  readonly modelFallback?: string
  readonly modelFallbackReasoningLevel?: ReasoningLevel
  readonly modelFallbackServiceTier?: ServiceTier
  readonly roleRationale?: string
}

export type LazycodexAgentOverrideMap = Readonly<Record<string, LazycodexAgentModelOverride>>

export const LAZYCODEX_AGENT_OVERRIDES_FILENAME = "lazycodex-agent-overrides.json"
export const OMO_AGENT_OVERRIDES_FILENAME = "omo-agent-overrides.json"

/** OMO / ultrawork agents users can tune per agent (LFP-style). */
export const CONFIGURABLE_LAZYCODEX_AGENT_NAMES = [
  "default",
  "sisyphus",
  "prometheus",
  "atlas",
  "oracle",
  "multimodal-looker",
  "visual-looker",
  "sisyphus-junior",
  "explorer",
  "reasoning",
  "coding",
  "librarian",
  "plan",
  "metis",
  "momus",
  "codex-ultrawork-reviewer",
  "ultrabrain",
  "deep",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "visual-engineering",
  "artistry",
  "artistry-gen",
  "artistry-qa",
  "ulw",
] as const

type StoredOverrideFields = {
  readonly model?: string
  readonly reasoning_level?: string
  readonly model_reasoning_effort?: string
  readonly service_tier?: string
  readonly model_fallback?: string
  readonly model_fallback_reasoning_effort?: string
  readonly model_fallback_service_tier?: string
  readonly role_rationale?: string
}

type StoredOverridesFile = {
  readonly version?: number
  readonly overrides?: Readonly<Record<string, StoredOverrideFields>>
}

export function lazycodexAgentOverridesPath(home: string): string {
  return join(home, ".grok", LAZYCODEX_AGENT_OVERRIDES_FILENAME)
}

export function omoAgentOverridesPath(home: string): string {
  return join(home, ".grok", OMO_AGENT_OVERRIDES_FILENAME)
}

export async function readOmoAgentOverridesFile(home: string): Promise<LazycodexAgentOverrideMap> {
  try {
    const raw = await readFile(omoAgentOverridesPath(home), "utf8")
    return parseOverridesJson(JSON.parse(raw) as StoredOverridesFile)
  } catch {
    return {}
  }
}

export async function readLazycodexAgentOverridesFile(home: string): Promise<LazycodexAgentOverrideMap> {
  try {
    const raw = await readFile(lazycodexAgentOverridesPath(home), "utf8")
    return parseOverridesJson(JSON.parse(raw) as StoredOverridesFile)
  } catch {
    return {}
  }
}

export async function writeLazycodexAgentOverridesFile(home: string, overrides: LazycodexAgentOverrideMap): Promise<string> {
  const path = lazycodexAgentOverridesPath(home)
  await mkdir(join(home, ".grok"), { recursive: true })
  const body = serializeAgentOverrides(overrides)
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  return path
}

export async function writeOmoAgentOverridesFile(home: string, overrides: LazycodexAgentOverrideMap): Promise<string> {
  const path = omoAgentOverridesPath(home)
  await mkdir(join(home, ".grok"), { recursive: true })
  const body = serializeAgentOverrides(overrides)
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  return path
}

export async function loadBundledDefaultOmoOverrides(moduleUrl?: string): Promise<LazycodexAgentOverrideMap> {
  try {
    const root = await resolveFlavourPackAssetsRoot(moduleUrl ?? import.meta.url)
    const raw = await readFile(join(root, "omo-agent-overrides.json"), "utf8")
    const parsed = JSON.parse(raw) as { readonly overrides?: Readonly<Record<string, StoredOverrideFields>> }
    const out: Record<string, LazycodexAgentModelOverride> = {}
    for (const [name, fields] of Object.entries(parsed.overrides ?? {})) {
      const model = fields.model
      const level = fields.reasoning_level ?? fields.model_reasoning_effort
      if (typeof model === "string" && model.length > 0 && isReasoningLevel(level)) {
        out[name] = parseOverrideFields(model, level, fields)
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Merge: user file > role discovery config > bundled LFP-style defaults. */
export function mergeLazycodexAgentOverrides(
  roleConfig: LazycodexAgentConfig,
  bundled: LazycodexAgentOverrideMap,
  fromFile: LazycodexAgentOverrideMap,
): LazycodexAgentOverrideMap {
  const merged: Record<string, LazycodexAgentModelOverride> = { ...bundled, ...fromFile }
  merged.explorer = mergeRoleWithBundled(fromFile.explorer, roleConfig.explorer, bundled.explorer)
  merged.reasoning = mergeRoleWithBundled(fromFile.reasoning, roleConfig.reasoning, bundled.reasoning)
  merged.coding = mergeRoleWithBundled(fromFile.coding, roleConfig.coding, bundled.coding)
  return merged
}

/** Role config provides model+reasoning; bundled provides fallback fields. User file wins overall. */
function mergeRoleWithBundled(
  fromFile: LazycodexAgentModelOverride | undefined,
  role: LazycodexAgentSetting,
  bundled: LazycodexAgentModelOverride | undefined,
): LazycodexAgentModelOverride {
  if (fromFile !== undefined) return fromFile
  const serviceTier = role.serviceTier ?? bundled?.serviceTier
  return {
    model: role.model,
    reasoningLevel: role.reasoningLevel,
    ...(serviceTier !== undefined ? { serviceTier } : {}),
    ...(bundled?.modelFallback !== undefined ? { modelFallback: bundled.modelFallback } : {}),
    ...(bundled?.modelFallbackReasoningLevel !== undefined ? { modelFallbackReasoningLevel: bundled.modelFallbackReasoningLevel } : {}),
    ...(bundled?.modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier: bundled.modelFallbackServiceTier } : {}),
    ...(bundled?.roleRationale !== undefined ? { roleRationale: bundled.roleRationale } : {}),
  }
}

export async function resolveLazycodexAgentOverrides(
  home: string,
  roleConfig: LazycodexAgentConfig,
): Promise<LazycodexAgentOverrideMap> {
  const [bundled, omoFile, legacyFile, lfgRuntimeConfig, lfgConfig] = await Promise.all([
    loadBundledDefaultOmoOverrides(),
    readOmoAgentOverridesFile(home),
    readLazycodexAgentOverridesFile(home),
    readLfgRuntimeConfigFile(home),
    readLfgConfigFile(home),
  ])
  const fromFile = Object.keys(omoFile).length > 0 ? omoFile : legacyFile
  const legacyMerged = mergeLazycodexAgentOverrides(roleConfig, bundled, fromFile)
  const runtimeMerged = applyLfgRuntimeConfigToAgentOverrides(legacyMerged, lfgRuntimeConfig)
  return applyLfgConfigToAgentOverrides(runtimeMerged, roleConfig, lfgConfig)
}

export function overrideForAgent(map: LazycodexAgentOverrideMap, agentName: string): LazycodexAgentModelOverride | undefined {
  return map[agentName]
}

function parseOverridesJson(data: StoredOverridesFile): LazycodexAgentOverrideMap {
  const out: Record<string, LazycodexAgentModelOverride> = {}
  for (const [name, fields] of Object.entries(data.overrides ?? {})) {
    const model = fields.model
    const level = fields.reasoning_level
    if (typeof model === "string" && model.length > 0 && isReasoningLevel(level)) {
      out[name] = parseOverrideFields(model, level, fields)
    }
  }
  return out
}

function serializeAgentOverrides(overrides: LazycodexAgentOverrideMap): StoredOverridesFile {
  return {
    version: 1,
    overrides: Object.fromEntries(
      Object.entries(overrides).map(([name, setting]) => [
        name,
        {
          model: setting.model,
          reasoning_level: setting.reasoningLevel,
          ...(setting.serviceTier !== undefined ? { service_tier: setting.serviceTier } : {}),
          ...(setting.modelFallback !== undefined ? { model_fallback: setting.modelFallback } : {}),
          ...(setting.modelFallbackReasoningLevel !== undefined ? { model_fallback_reasoning_effort: setting.modelFallbackReasoningLevel } : {}),
          ...(setting.modelFallbackServiceTier !== undefined ? { model_fallback_service_tier: setting.modelFallbackServiceTier } : {}),
          ...(setting.roleRationale !== undefined ? { role_rationale: setting.roleRationale } : {}),
        },
      ]),
    ),
  }
}

function parseOverrideFields(
  model: string,
  reasoningLevel: ReasoningLevel,
  fields: StoredOverrideFields,
): LazycodexAgentModelOverride {
  return {
    model,
    reasoningLevel,
    ...(isServiceTier(fields.service_tier) ? { serviceTier: fields.service_tier } : {}),
    ...(typeof fields.model_fallback === "string" && fields.model_fallback.length > 0 ? { modelFallback: fields.model_fallback } : {}),
    ...(isReasoningLevel(fields.model_fallback_reasoning_effort) ? { modelFallbackReasoningLevel: fields.model_fallback_reasoning_effort } : {}),
    ...(isServiceTier(fields.model_fallback_service_tier) ? { modelFallbackServiceTier: fields.model_fallback_service_tier } : {}),
    ...(typeof fields.role_rationale === "string" && fields.role_rationale.length > 0 ? { roleRationale: fields.role_rationale } : {}),
  }
}

function isReasoningLevel(value: string | undefined): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
}

function isServiceTier(value: string | undefined): value is ServiceTier {
  return value === "default" || value === "fast"
}
