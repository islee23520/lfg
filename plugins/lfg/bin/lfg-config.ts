import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { findExistingEndpointBaseUrl, grokModelAlias, normalizeGrokBaseUrl, renderGrokByokConfig, type GrokByokBaseUrlSource, type GrokByokModelConfig } from "./lfg-config-toml"
import { detectLazycodexAdapter } from "./lfg-grok"
import type { JsonObject } from "./lfg-json"
import { resolveRequiredModels } from "./lfg-lazycodex-models"

export const DEFAULT_GROK_BYOK_MODEL_ID = "gpt-5"
const GROK_SECONDARY_MODEL_ALIAS = "grok-build"
const GROK_BYOK_PROVIDER = "custom_openai_compatible"
const REQUIRED_GROK_BYOK_ENV = ["LFG_GROK_API_KEY", "LFG_GROK_MODEL_ALIAS"] as const
const REQUIRED_GROK_BYOK_BATCH_ENV = ["LFG_GROK_API_KEY", "LFG_GROK_MODELS"] as const

export type GrokByokBatchInput = {
  readonly baseUrl: string
  readonly baseUrlSource: GrokByokBaseUrlSource
  readonly apiKey: string
  readonly upstreamModelId?: string
  readonly models: readonly { readonly modelId: string; readonly displayName?: string }[]
}

export type GrokByokConfigInput = {
  readonly baseUrl: string
  readonly baseUrlSource: GrokByokBaseUrlSource
  readonly apiKey: string
  readonly modelAlias: string
  readonly modelId: string
  readonly displayName: string
}

export function grokByokPlan(): JsonObject {
  return {
    ok: true,
    status: "planned",
    command: "config grok-byok",
    purpose: "Configure a Grok OpenAI-compatible BYOK model for Grok Build lazycodex use.",
    mutatesGlobalConfig: true,
    executed: false,
    provider: GROK_BYOK_PROVIDER,
    supportsBatch: true,
    requiredModelsSource: "adapter model-catalog.json and components/*/agents/*.toml (or LFG_GROK_MODELS)",
    requiredSettings: ["apiKey", "modelAlias"],
    conditionalSettings: ["baseUrl is required only when ~/.grok/config.toml has no [endpoints].models_base_url."],
    defaultModelId: DEFAULT_GROK_BYOK_MODEL_ID,
    secondaryModelAlias: GROK_SECONDARY_MODEL_ALIAS,
    automationEnv: [...REQUIRED_GROK_BYOK_ENV],
    batchAutomationEnv: [...REQUIRED_GROK_BYOK_BATCH_ENV],
    optionalAutomationEnv: ["LFG_GROK_BASE_URL", "LFG_GROK_MODEL_ID", "LFG_GROK_DISPLAY_NAME"],
    target: grokConfigPath(),
    steps: [
      { id: "collect_provider_settings", status: "pending", text: "Collect API key, model alias, upstream model id, and base URL only when [endpoints].models_base_url is absent." },
      { id: "write_grok_config", status: "pending", text: "Back up and update ~/.grok/config.toml while preserving existing [endpoints] when possible." },
    ],
  }
}

export async function configureGrokByokFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<JsonObject> {
  const path = grokConfigPath()
  const previous = await readConfigOrEmpty(path)
  const batch = await grokByokBatchInputFromEnv(env, previous)
  if (batch !== null) return configureGrokByokModels(batch)
  const input = grokByokInputFromEnv(env, previous)
  if (input === null) {
    const existingEndpointBaseUrl = findExistingEndpointBaseUrl(previous)
    return {
      ok: false,
      status: "missing_config",
      executed: false,
      error: `Set ${REQUIRED_GROK_BYOK_BATCH_ENV.join(", ")} or ${REQUIRED_GROK_BYOK_ENV.join(", ")} and either LFG_GROK_BASE_URL or [endpoints].models_base_url before running lfg --json config grok-byok --run.`,
      requiredEnv: [...REQUIRED_GROK_BYOK_ENV],
      batchRequiredEnv: [...REQUIRED_GROK_BYOK_BATCH_ENV],
      conditionalEnv: ["LFG_GROK_BASE_URL"],
      existingEndpointDetected: existingEndpointBaseUrl !== null,
      optionalEnv: ["LFG_GROK_MODEL_ID", "LFG_GROK_DISPLAY_NAME"],
    }
  }
  return configureGrokByok(input)
}

export async function configureGrokByokModels(input: GrokByokBatchInput): Promise<JsonObject> {
  const path = grokConfigPath()
  const previous = await readConfigOrEmpty(path)
  const backupPath = previous ? `${path}.lfg-backup-${timestamp()}` : null
  if (backupPath) await writeFile(backupPath, previous)
  const modelConfigs = modelConfigsFromBatch(input)
  await writeGrokConfigAtomically(path, renderGrokByokConfig(previous, input.baseUrl, input.baseUrlSource, modelConfigs, GROK_SECONDARY_MODEL_ALIAS))
  const configuredModels = modelConfigs.map((model) => ({ alias: model.alias, modelId: model.modelId }))
  const primaryAlias = configuredModels[0]?.alias ?? DEFAULT_GROK_BYOK_MODEL_ID
  return {
    ok: true,
    status: "configured",
    command: "config grok-byok",
    executed: true,
    target: path,
    backupPath,
    provider: GROK_BYOK_PROVIDER,
    supportsBatch: true,
    configuredModels,
    modelCount: configuredModels.length,
    secondaryModelAlias: GROK_SECONDARY_MODEL_ALIAS,
    baseUrl: input.baseUrl,
    baseUrlSource: input.baseUrlSource,
    apiKeyConfigured: input.apiKey.length > 0,
    verificationCommands: ["grok models", `grok -m ${primaryAlias} -p 'Reply LFG_GROK_BUILD_OK'`, `grok -m ${GROK_SECONDARY_MODEL_ALIAS} -p 'Reply LFG_GROK_BUILD_OK'`, "grok inspect --json"],
  }
}

export async function configureGrokByok(input: GrokByokConfigInput): Promise<JsonObject> {
  const path = grokConfigPath()
  const previous = await readConfigOrEmpty(path)
  const backupPath = previous ? `${path}.lfg-backup-${timestamp()}` : null
  if (backupPath) await writeFile(backupPath, previous)
  const next = renderGrokByokConfig(previous, input.baseUrl, input.baseUrlSource, modelConfigsFromSingle(input), GROK_SECONDARY_MODEL_ALIAS)
  await writeGrokConfigAtomically(path, next)
  return {
    ok: true,
    status: "configured",
    command: "config grok-byok",
    executed: true,
    target: path,
    backupPath,
    provider: GROK_BYOK_PROVIDER,
    modelAlias: input.modelAlias,
    secondaryModelAlias: GROK_SECONDARY_MODEL_ALIAS,
    modelId: input.modelId,
    baseUrl: input.baseUrl,
    baseUrlSource: input.baseUrlSource,
    apiKeyConfigured: input.apiKey.length > 0,
    verificationCommands: ["grok models", `grok -m ${input.modelAlias} -p 'Reply LFG_GROK_BUILD_OK'`, `grok -m ${GROK_SECONDARY_MODEL_ALIAS} -p 'Reply LFG_GROK_BUILD_OK'`, "grok inspect --json"],
  }
}

function grokByokInputFromEnv(env: NodeJS.ProcessEnv, currentConfig: string): GrokByokConfigInput | null {
  const baseUrlFromEnv = env.LFG_GROK_BASE_URL?.trim()
  const endpointBaseUrl = findExistingEndpointBaseUrl(currentConfig)
  const baseUrl = normalizeGrokBaseUrl(baseUrlFromEnv || endpointBaseUrl)
  const apiKey = env.LFG_GROK_API_KEY?.trim()
  const modelAlias = env.LFG_GROK_MODEL_ALIAS?.trim()
  if (!baseUrl || !apiKey || !modelAlias) return null
  return {
    baseUrl,
    baseUrlSource: baseUrlFromEnv ? "environment" : "existing_endpoints",
    apiKey,
    modelAlias: grokModelAlias(modelAlias),
    modelId: env.LFG_GROK_MODEL_ID?.trim() || inferUpstreamModelId(modelAlias),
    displayName: env.LFG_GROK_DISPLAY_NAME?.trim() || modelAlias,
  }
}

function grokConfigPath(): string {
  return join(homedir(), ".grok", "config.toml")
}

async function readConfigOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return ""
    throw error
  }
}

async function grokByokBatchInputFromEnv(env: NodeJS.ProcessEnv, currentConfig: string): Promise<GrokByokBatchInput | null> {
  const models = await requiredModelsFromEnvOrAdapter(env)
  if (models.length === 0) return null
  const baseUrlFromEnv = env.LFG_GROK_BASE_URL?.trim()
  const endpointBaseUrl = findExistingEndpointBaseUrl(currentConfig)
  const baseUrl = normalizeGrokBaseUrl(baseUrlFromEnv || endpointBaseUrl)
  const apiKey = env.LFG_GROK_API_KEY?.trim()
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    baseUrlSource: baseUrlFromEnv ? "environment" : "existing_endpoints",
    apiKey,
    upstreamModelId: env.LFG_GROK_MODEL_ID?.trim() || undefined,
    models: models.map((modelId) => ({ modelId, displayName: modelId })),
  }
}

async function requiredModelsFromEnvOrAdapter(env: NodeJS.ProcessEnv): Promise<readonly string[]> {
  if (env.LFG_GROK_MODEL_ALIAS?.trim()) return []
  const adapter = detectLazycodexAdapter()
  return resolveRequiredModels(adapter.found ? adapter.root : null, env)
}

function modelConfigsFromBatch(input: GrokByokBatchInput): readonly GrokByokModelConfig[] {
  return input.models.map((model) => ({ alias: grokModelAlias(model.modelId), modelId: input.upstreamModelId ?? model.modelId, displayName: model.displayName ?? model.modelId, apiKey: input.apiKey }))
}

function modelConfigsFromSingle(input: GrokByokConfigInput): readonly GrokByokModelConfig[] {
  return [{ alias: input.modelAlias, modelId: input.modelId, displayName: input.displayName, apiKey: input.apiKey }]
}

function inferUpstreamModelId(alias: string): string {
  return /^gpt-\d+(?:[.-][\w-]+)*$/i.test(alias) ? alias : DEFAULT_GROK_BYOK_MODEL_ID
}

async function writeGrokConfigAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.lfg-tmp-${process.pid}`
  await writeFile(temporaryPath, contents)
  await rename(temporaryPath, path)
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 14)
}
