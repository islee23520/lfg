import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { JsonObject } from "./lfg-json"

export const DEFAULT_GROK_BYOK_MODEL_ID = "gpt-5.5"
const REQUIRED_GROK_BYOK_ENV = ["LFG_GROK_BASE_URL", "LFG_GROK_API_KEY", "LFG_GROK_MODEL_ALIAS"] as const

export type GrokByokConfigInput = {
  readonly baseUrl: string
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
    providerMode: "interactive",
    providerChoices: ["cli_proxy", "cri_proxy", "custom_openai_compatible", "skip"],
    requiredSettings: ["baseUrl", "apiKey", "modelAlias"],
    defaultModelId: DEFAULT_GROK_BYOK_MODEL_ID,
    automationEnv: [...REQUIRED_GROK_BYOK_ENV],
    target: grokConfigPath(),
    steps: [
      { id: "choose_provider", status: "pending", text: "Ask whether to use the CLI proxy, CRI proxy, a custom OpenAI-compatible provider, or skip BYOK configuration." },
      { id: "collect_provider_settings", status: "pending", text: "Collect base URL, API key, model alias, and upstream model id." },
      { id: "write_grok_config", status: "pending", text: "Back up and update ~/.grok/config.toml with [endpoints] and [model.<alias>] entries." },
    ],
  }
}

export async function configureGrokByokFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<JsonObject> {
  const input = grokByokInputFromEnv(env)
  if (input === null) {
    return {
      ok: false,
      status: "missing_config",
      executed: false,
      error: `Set ${REQUIRED_GROK_BYOK_ENV.join(", ")} before running lfg --json config grok-byok --run.`,
      requiredEnv: [...REQUIRED_GROK_BYOK_ENV],
      optionalEnv: ["LFG_GROK_MODEL_ID", "LFG_GROK_DISPLAY_NAME"],
    }
  }
  return configureGrokByok(input)
}

export async function configureGrokByok(input: GrokByokConfigInput): Promise<JsonObject> {
  const path = grokConfigPath()
  const previous = await readConfigOrEmpty(path)
  const backupPath = previous ? `${path}.lfg-backup-${timestamp()}` : null
  if (backupPath) await writeFile(backupPath, previous)
  const next = renderConfig(previous, input)
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.lfg-tmp-${process.pid}`
  await writeFile(temporaryPath, next)
  await rename(temporaryPath, path)
  return {
    ok: true,
    status: "configured",
    command: "config grok-byok",
    executed: true,
    target: path,
    backupPath,
    modelAlias: input.modelAlias,
    modelId: input.modelId,
    baseUrl: input.baseUrl,
    apiKeyConfigured: input.apiKey.length > 0,
    verificationCommands: ["grok models", `grok -m ${input.modelAlias} -p 'Reply LFG_GROK_BUILD_OK'`, "grok inspect --json"],
  }
}

function grokByokInputFromEnv(env: NodeJS.ProcessEnv): GrokByokConfigInput | null {
  const baseUrl = env.LFG_GROK_BASE_URL?.trim()
  const apiKey = env.LFG_GROK_API_KEY?.trim()
  const modelAlias = env.LFG_GROK_MODEL_ALIAS?.trim()
  if (!baseUrl || !apiKey || !modelAlias) return null
  return {
    baseUrl,
    apiKey,
    modelAlias,
    modelId: env.LFG_GROK_MODEL_ID?.trim() || DEFAULT_GROK_BYOK_MODEL_ID,
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

function renderConfig(previous: string, input: GrokByokConfigInput): string {
  const withoutEndpoints = removeTomlSection(previous, "endpoints")
  const withoutModel = removeTomlSection(withoutEndpoints, `model.${input.modelAlias}`)
  const body = withoutModel.trimEnd()
  const addition = [
    "[endpoints]",
    `models_base_url = ${tomlString(input.baseUrl)}`,
    "",
    `[model.${input.modelAlias}]`,
    `model = ${tomlString(input.modelId)}`,
    `base_url = ${tomlString(input.baseUrl)}`,
    `name = ${tomlString(input.displayName)}`,
    `api_key = ${tomlString(input.apiKey)}`,
    'api_backend = "responses"',
    'auth_scheme = "bearer"',
    "",
  ].join("\n")
  return body ? `${body}\n\n${addition}` : addition
}

function removeTomlSection(source: string, section: string): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  let skipping = false
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header) skipping = header[1] === section
    if (!skipping) output.push(line)
  }
  return output.join("\n")
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 14)
}
