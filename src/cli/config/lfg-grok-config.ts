import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { isBareKey, removeTomlKey, removeTomlSectionsByPrefix, tomlString, upsertSection, upsertTomlKey } from "./lfg-grok-config-toml"
import { upsertModelSections } from "./lfg-grok-model-sections"
import type { JsonObject } from "../../shared/json"
import { defaultLazycodexAgentConfig, type LazycodexAgentConfig, type ModelDiscovery } from "../models/lfg-models"

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
  /** Full per-agent model+reasoning map (roles + LFP/omo imported + flavour-pack). When present, used for all [lazycodex.agents.*] sections. */
  readonly fullAgentModels?: Readonly<Record<string, { model: string; reasoningLevel: string }>>
}

/** Sections lfg merges in ~/.grok/config.toml. writeGrokModelConfig owns install-time writes; the SessionStart config-loader may only seed models.default from omo.models.default when absent (never overwrite). */
export const LFG_OWNED_GROK_CONFIG_SECTIONS = [
  "endpoints.models_base_url",
  "models.default",
  "model.*",
  "omo.models",
  "omo.providers",
  "omo.agents",
] as const

export async function writeGrokModelConfig(discovery: ModelDiscovery, options: GrokConfigOptions = {}): Promise<GrokConfigUpdate> {
  const home = options.home ?? homedir()
  const path = join(home, ".grok", "config.toml")
  const baseUrl = modelsBaseUrl(discovery)
  const current = await readTextIfExists(path)
  const endpoints = options.hostAuthOnly === true
    ? removeTomlSectionsByPrefix(
        removeTomlKey(removeTomlKey(current, "endpoints", "models_base_url"), "endpoints", "api_key"),
        "model.",
      )
    : removeTomlKey(upsertTomlKey(current, "endpoints", "models_base_url", baseUrl), "endpoints", "api_key")
  const agentConfig = options.agentConfig ?? discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const modelConfig = upsertModelSections(
    upsertSection(endpoints, "models", [`default = ${tomlString(discovery.mapping.default)}`]),
    discovery,
    options.hostAuthOnly === true ? null : baseUrl,
    options.apiKey,
    current,
  )
  let withAgents = upsertOmoAgentSections(modelConfig, agentConfig)
  if (options.fullAgentModels && Object.keys(options.fullAgentModels).length > 0) {
    withAgents = upsertAllOmoAgentSections(withAgents, options.fullAgentModels)
  }
  const omoModelsLines = [
    `default = ${tomlString(discovery.mapping.default)}`,
    `fast = ${tomlString(discovery.mapping.fast)}`,
    `reasoning = ${tomlString(discovery.mapping.reasoning)}`,
    `coding = ${tomlString(discovery.mapping.coding)}`,
  ]
  if (discovery.modelIds.length > 0) {
    omoModelsLines.push(`available = [${discovery.modelIds.map((id) => tomlString(id)).join(", ")}]`)
  }
  const next = upsertSection(withAgents, "omo.models", omoModelsLines)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, "utf8")
  return { status: "configured", path, modelsBaseUrl: baseUrl }
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
 * Performs discovery (if provided) and writes lfg-owned sections (endpoints, model.*, omo.models/agents).
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

function upsertOmoAgentSections(source: string, agentConfig: LazycodexAgentConfig): string {
  return Object.entries(agentConfig).reduce(
    (next, [agentName, setting]) =>
      upsertSection(next, `omo.agents.${agentName}`, [
        `model = ${tomlString(setting.model)}`,
        `reasoning_level = ${tomlString(setting.reasoningLevel)}`,
      ]),
    source,
  )
}

function upsertAllOmoAgentSections(
  source: string,
  full: Readonly<Record<string, { readonly model: string; readonly reasoningLevel: string; readonly modelFallback?: string; readonly modelFallbackReasoningLevel?: string }>>,
): string {
  return Object.entries(full).reduce(
    (next, [agentName, setting]) =>
      isBareKey(agentName)
        ? upsertSection(next, `omo.agents.${agentName}`, agentOverrideTomlLines(setting))
        : next,
    source,
  )
}

function agentOverrideTomlLines(setting: { readonly model: string; readonly reasoningLevel: string; readonly modelFallback?: string; readonly modelFallbackReasoningLevel?: string }): readonly string[] {
  const lines: string[] = [
    `model = ${tomlString(setting.model)}`,
    `reasoning_level = ${tomlString(setting.reasoningLevel)}`,
  ]
  if (setting.modelFallback !== undefined) {
    lines.push(`model_fallback = ${tomlString(setting.modelFallback)}`)
  }
  if (setting.modelFallbackReasoningLevel !== undefined) {
    lines.push(`model_fallback_reasoning_level = ${tomlString(setting.modelFallbackReasoningLevel)}`)
  }
  return lines
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
