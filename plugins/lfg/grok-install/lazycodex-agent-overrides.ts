import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAgentConfig, ReasoningLevel } from "../bin/lfg-models"
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset"

export type LazycodexAgentModelOverride = {
  readonly model: string
  readonly reasoningLevel: ReasoningLevel
}

export type LazycodexAgentOverrideMap = Readonly<Record<string, LazycodexAgentModelOverride>>

export const LAZYCODEX_AGENT_OVERRIDES_FILENAME = "lazycodex-agent-overrides.json"

/** OMO / ultrawork agents users can tune per agent (LFP-style). */
export const CONFIGURABLE_LAZYCODEX_AGENT_NAMES = [
  "explorer",
  "reasoning",
  "coding",
  "librarian",
  "plan",
  "metis",
  "momus",
  "codex-ultrawork-reviewer",
] as const

type StoredOverridesFile = {
  readonly version?: number
  readonly overrides?: Readonly<Record<string, { readonly model?: string; readonly reasoning_level?: string }>>
}

export function lazycodexAgentOverridesPath(home: string): string {
  return join(home, ".grok", LAZYCODEX_AGENT_OVERRIDES_FILENAME)
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
  const body = {
    version: 1,
    overrides: Object.fromEntries(
      Object.entries(overrides).map(([name, setting]) => [
        name,
        { model: setting.model, reasoning_level: setting.reasoningLevel },
      ]),
    ),
  }
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  return path
}

export async function loadBundledDefaultOmoOverrides(moduleUrl?: string): Promise<LazycodexAgentOverrideMap> {
  try {
    const root = await resolveFlavourPackAssetsRoot(moduleUrl ?? import.meta.url)
    const raw = await readFile(join(root, "omo-agent-overrides.json"), "utf8")
    const parsed = JSON.parse(raw) as { readonly overrides?: Readonly<Record<string, { readonly model?: string; readonly model_reasoning_effort?: string }>> }
    const out: Record<string, LazycodexAgentModelOverride> = {}
    for (const [name, fields] of Object.entries(parsed.overrides ?? {})) {
      const model = fields.model
      const level = fields.model_reasoning_effort
      if (typeof model === "string" && model.length > 0 && isReasoningLevel(level)) {
        out[name] = { model, reasoningLevel: level }
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
  merged.explorer = fromFile.explorer ?? roleConfig.explorer
  merged.reasoning = fromFile.reasoning ?? roleConfig.reasoning
  merged.coding = fromFile.coding ?? roleConfig.coding
  return merged
}

export async function resolveLazycodexAgentOverrides(
  home: string,
  roleConfig: LazycodexAgentConfig,
): Promise<LazycodexAgentOverrideMap> {
  const [bundled, fromFile] = await Promise.all([loadBundledDefaultOmoOverrides(), readLazycodexAgentOverridesFile(home)])
  return mergeLazycodexAgentOverrides(roleConfig, bundled, fromFile)
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
      out[name] = { model, reasoningLevel: level }
    }
  }
  return out
}

function isReasoningLevel(value: string | undefined): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
}