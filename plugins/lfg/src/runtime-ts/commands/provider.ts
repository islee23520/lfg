import { join } from "node:path"
import { bootstrapState } from "../foundation/state-schema"
import { APPROVED_MODEL_PROVIDERS, asRecord, commandEnv, defaultProviderAuthScheme, defaultProviderEnv, defaultProviderTransport, ensureMetadataOnlyValue, ENV_NAME_PATTERN, PROVIDER_DEFAULT_MODELS, providersPath, readProviderState, utcNow, validateSafeId, writeJson, type CommandContext, type JsonObject } from "./common"

export type ProviderAddOptions = { id: string; kind: string; env?: string; model?: string; transport?: string; authScheme?: string }
export type ProviderShowOptions = { id: string }

export async function providerAdd(options: ProviderAddOptions, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  await bootstrapState(env)
  const providerId = ensureMetadataOnlyValue(validateSafeId(options.id, "provider id"), "provider id")
  if (!APPROVED_MODEL_PROVIDERS.includes(options.kind as (typeof APPROVED_MODEL_PROVIDERS)[number])) throw new Error(`unknown provider kind: ${options.kind}`)
  const envName = options.env ?? defaultProviderEnv(options.kind)
  if (!ENV_NAME_PATTERN.test(envName)) throw new Error(`invalid env var name: ${envName}`)
  const model = options.model ?? PROVIDER_DEFAULT_MODELS[options.kind]
  if (model) ensureMetadataOnlyValue(model, "model")
  const provider = { id: providerId, kind: options.kind, env: envName, model, transport: options.transport ?? defaultProviderTransport(options.kind), authScheme: options.authScheme ?? defaultProviderAuthScheme(options.kind), secretStored: false, addedAt: utcNow() }
  const state = await readProviderState(env)
  const providers = asRecord(state.providers)
  providers[providerId] = provider
  state.providers = providers
  state.updatedAt = utcNow()
  await writeJson(providersPath(env), state)
  return { ok: true, status: "ok", provider, path: providersPath(env), count: Object.keys(providers).length }
}

export async function providerList(context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const state = await readProviderState(env)
  const providers = Object.values(asRecord(state.providers))
  return { ok: true, status: "ok", count: providers.length, providers, path: providersPath(env) }
}

export async function providerShow(options: ProviderShowOptions, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const providerId = validateSafeId(options.id, "provider id")
  const state = await readProviderState(env)
  const providers = asRecord(state.providers)
  const provider = providers[providerId]
  if (!provider) return { ok: false, status: "error", error: "provider not found", id: providerId, known: Object.keys(providers).sort() }
  return { ok: true, status: "ok", provider, path: providersPath(env) }
}

export function providerPublicConfig(providerId: string | undefined, kind: string, providers: JsonObject): JsonObject {
  const selected = providerId ? asRecord(providers[providerId]) : Object.values(providers).map(asRecord).find((item) => item.kind === kind)
  if (selected && Object.keys(selected).length > 0) return selected
  return { id: providerId ?? `${kind}-default`, kind, env: defaultProviderEnv(kind), model: PROVIDER_DEFAULT_MODELS[kind], transport: defaultProviderTransport(kind), authScheme: defaultProviderAuthScheme(kind), secretStored: false }
}

export function providerStateFile(envRoot: string): string {
  return join(envRoot, "state", "providers.json")
}
