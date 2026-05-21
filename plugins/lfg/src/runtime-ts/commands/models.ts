import { deepMerge } from "@oh-my-opencode/utils"
import { OMO_CATEGORY_MODEL_PROFILES, OMO_MODEL_MATCHING_SOURCE, OMO_ROLE_FIT_POLICIES } from "../services/model-resolution"
import { asRecord, commandEnv, DEFAULT_MODEL_PROVIDER, defaultProviderAuthScheme, defaultProviderEnv, defaultProviderTransport, PROVIDER_DEFAULT_MODELS, providersPath, readJsonObject, readProviderState, modelSelectionPath, type CommandContext, type JsonObject } from "./common"

export async function readModelSelection(context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const fallback = { provider: "xai", model: PROVIDER_DEFAULT_MODELS.xai, reasoning: "high", source: "default", updatedAt: null, switchCommand: `/model ${PROVIDER_DEFAULT_MODELS.xai}` }
  return { ...fallback, ...await readJsonObject(modelSelectionPath(env), {}) }
}

export async function configuredModelProviders(context: CommandContext = {}): Promise<JsonObject[]> {
  const env = commandEnv(context)
  const state = await readProviderState(env)
  return Object.values(asRecord(state.providers)).map(asRecord).sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? ""))).map((provider) => ({ id: provider.id, kind: provider.kind, env: provider.env, model: provider.model ?? PROVIDER_DEFAULT_MODELS[String(provider.kind ?? "")], transport: provider.transport, authScheme: provider.authScheme ?? defaultProviderAuthScheme(String(provider.kind ?? "")), secretStored: Boolean(provider.secretStored) }))
}

export async function modelsShow(options: { provider?: string } = {}, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  if (options.provider && !(options.provider in PROVIDER_DEFAULT_MODELS)) return { ok: false, status: "error", error: "unsupported model provider", provider: options.provider, known: Object.keys(PROVIDER_DEFAULT_MODELS).sort() }
  const defaults: JsonObject = {}
  for (const key of Object.keys(PROVIDER_DEFAULT_MODELS).sort()) defaults[key] = { provider: key, model: PROVIDER_DEFAULT_MODELS[key], env: defaultProviderEnv(key), configured: false }
  const configured = await configuredModelProviders(context)
  for (const item of configured) {
    const kind = String(item.kind ?? "")
    if (kind in defaults) defaults[kind] = deepMerge(asRecord(defaults[kind]), { ...item, configured: true }) ?? {}
  }
  const selected = options.provider ? { [options.provider]: defaults[options.provider] } : defaults
  return { ok: true, status: "ok", defaultProvider: DEFAULT_MODEL_PROVIDER, modelRouter: { provider: DEFAULT_MODEL_PROVIDER, transport: defaultProviderTransport(DEFAULT_MODEL_PROVIDER), defaultModel: PROVIDER_DEFAULT_MODELS[DEFAULT_MODEL_PROVIDER], oracleGate: "xai/grok", reason: "Approved multi-provider metadata is explicit; Grok Oracle review remains mandatory and native child spawning is manual-gated." }, grokOracle: { provider: "xai", model: PROVIDER_DEFAULT_MODELS.xai, transport: defaultProviderTransport("xai"), authScheme: defaultProviderAuthScheme("xai") }, currentModel: await readModelSelection(context), grokBuildModelSwitch: { slash: "/model <provider/model>", cli: "lfg models switch <provider/model>", tmux: "lfg grok-build model <provider/model>" }, providers: selected, configuredProviders: configured, categoryModelProfiles: OMO_CATEGORY_MODEL_PROFILES, modelMatchingSource: OMO_MODEL_MATCHING_SOURCE, roleFitPolicies: OMO_ROLE_FIT_POLICIES, path: providersPath(env), secretStorage: "env-name-only" }
}
