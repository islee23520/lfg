import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ProviderSource } from "../../cli/models/lfg-models"

/** Read every `[omo.providers.<id>]` section from ~/.grok/config.toml into ProviderSources; sections lacking base_url are skipped. Non-destructive. */
export async function readOmoProvidersFromConfig(home: string): Promise<ProviderSource[]> {
  const path = join(home, ".grok", "config.toml")
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
  return parseOmoProviders(text)
}

export function parseOmoProviders(source: string): ProviderSource[] {
  const providers: ProviderSource[] = []
  const re = /^\[omo\.providers\.([^\]]+)\]\s*$/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const id = match[1].trim().replaceAll('"', "").replaceAll("'", "")
    const headerEnd = match.index + match[0].length
    const rest = source.slice(headerEnd)
    const nextHeader = /\n\[[^\n]+\]/.exec(rest)
    const body = nextHeader?.index === undefined ? rest : rest.slice(0, nextHeader.index)
    const baseUrl = findTomlStringValue(body, "base_url")
    if (baseUrl === null || baseUrl.length === 0) continue
    const apiKey = findTomlStringValue(body, "api_key")
    const envKey = findTomlStringValue(body, "env_key")
    providers.push({
      id,
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
      ...(envKey ? { envKey } : {}),
    })
  }
  return providers
}

function findTomlStringValue(body: string, key: string): string | null {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`, "m")
  const match = pattern.exec(body)
  if (!match?.[1]) return null
  return parseTomlStringValue(match[1].trim())
}

function parseTomlStringValue(raw: string): string | null {
  if (raw.startsWith('"""') || raw.startsWith("'''")) return null
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\")
  }
  return raw.length > 0 ? raw : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
