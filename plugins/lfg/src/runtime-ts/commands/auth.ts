import { asRecord, type CommandContext, type JsonObject } from "./common"
import { providerAdd } from "./provider"
import { commandEnv, readProviderState } from "./common"

export type AuthLoginOptions = { provider: string; id?: string; env?: string; model?: string }

export async function authLogin(options: AuthLoginOptions, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const state = await readProviderState(env)
  const configured = Object.values(asRecord(state.providers)).map(asRecord).sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")))
  const selected = configured.find((item) => item.kind === options.provider)
  const result = await providerAdd({ id: options.id ?? String(selected?.id ?? `${options.provider}-main`), kind: options.provider, env: options.env ?? (typeof selected?.env === "string" ? selected.env : undefined), model: options.model ?? (typeof selected?.model === "string" ? selected.model : undefined) }, context)
  const provider = asRecord(result.provider)
  result.auth = { login: true, provider: provider.kind, env: provider.env, secretStored: false, note: "Store the API key in the named environment variable; LFG records no secret values." }
  return result
}
