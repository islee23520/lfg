import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export async function resolveGrokApiKey(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const explicit = firstNonEmpty(env.OPENAI_API_KEY, env.XAI_API_KEY)
  if (explicit !== undefined) {
    return explicit
  }

  const home = env.HOME ?? homedir()
  try {
    return readCodexProviderApiKey(await readFile(join(home, ".codex", "config.toml"), "utf8"))
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

export function readCodexProviderApiKey(config: string): string | undefined {
  const provider = readTopLevelTomlString(config, "model_provider")
  if (provider === undefined) {
    return undefined
  }
  const section = readTomlSection(config, `model_providers.${provider}`)
  if (section === null) {
    return undefined
  }
  return firstNonEmpty(
    readTomlString(section, "experimental_bearer_token"),
    readTomlString(section, "api_key"),
  )
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}

function readTopLevelTomlString(source: string, key: string): string | undefined {
  const firstSection = source.search(/^\s*\[[^\n]+]/m)
  const topLevel = firstSection === -1 ? source : source.slice(0, firstSection)
  return readTomlString(topLevel, key)
}

function readTomlString(source: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(["'])(.*?)\\1\\s*$`, "m")
  return pattern.exec(source)?.[2]
}

function readTomlSection(source: string, section: string): string | null {
  const pattern = makeSectionRegex(section)
  return pattern.exec(source)?.[0] ?? null
}

function makeSectionRegex(section: string): RegExp {
  const parts = section.split(".").map(makeTomlKeyPattern)
  return new RegExp(`(^|\\n)\\[\\s*${parts.join("\\s*\\.\\s*")}\\s*\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`)
}

function makeTomlKeyPattern(part: string): string {
  const escaped = escapeRegExp(part)
  return /^[A-Za-z0-9_-]+$/.test(part) ? `(?:"${escaped}"|'${escaped}'|${escaped})` : `(?:"${escaped}"|'${escaped}')`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
