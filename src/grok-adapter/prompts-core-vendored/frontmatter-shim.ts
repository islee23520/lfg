export type FrontmatterMode = "default" | "rule"

export interface ParseFrontmatterOptions {
  readonly mode?: FrontmatterMode
}

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T
  body: string
  hadFrontmatter: boolean
  parseError: boolean
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n([\s\S]*)$/

/**
 * Minimal frontmatter parser for bundled prompts.
 *
 * Bundled prompts ship without YAML frontmatter, so the default-mode parser
 * only handles the delimiter detection + a safe subset of flat key/value YAML
 * (strings, numbers, booleans, arrays). This avoids pulling in js-yaml as a
 * runtime dependency while matching the upstream parseFrontmatter surface.
 *
 * Rule-mode frontmatter is not used by prompts-core and is intentionally omitted.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string,
  options: ParseFrontmatterOptions = {},
): FrontmatterResult<T> {
  if (options.mode === "rule") {
    return { data: {} as T, body: content, hadFrontmatter: false, parseError: false }
  }

  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    return { data: {} as T, body: content, hadFrontmatter: false, parseError: false }
  }

  const yamlContent = match[1] ?? ""
  const body = match[2] ?? ""

  try {
    const data = parseSimpleYaml(yamlContent) as T
    return { data, body, hadFrontmatter: true, parseError: false }
  } catch {
    return { data: {} as T, body, hadFrontmatter: true, parseError: true }
  }
}

function parseSimpleYaml(yamlContent: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yamlContent.replace(/\r\n/g, "\n").split("\n")

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1
      continue
    }

    const colon = trimmed.indexOf(":")
    if (colon === -1) {
      i += 1
      continue
    }

    const key = trimmed.slice(0, colon).trim()
    const rawValue = trimmed.slice(colon + 1).trim()
    result[key] = parseScalar(rawValue)
    i += 1
  }

  return result
}

function parseScalar(value: string): unknown {
  if (value === "") return ""
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null
  if (/^-?\d+$/.test(value)) return Number(value)
  if (/^-?\d+\.\d+$/.test(value)) return Number(value)
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}
