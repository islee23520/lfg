import { readFileSync } from "node:fs"

export interface JsoncParseResult<T = unknown> {
  readonly data?: T
  readonly error?: Error
}

export interface DetectPluginConfigFileOptions {
  readonly cwd?: string
  readonly names?: readonly string[]
}

function stripJsoncComments(input: string): string {
  let output = ""
  let inString = false
  let stringQuote = ""
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === stringQuote) {
        inString = false
        stringQuote = ""
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = true
      stringQuote = char
      output += char
      continue
    }

    if (char === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") {
        index += 1
      }
      output += "\n"
      continue
    }

    if (char === "/" && next === "*") {
      index += 2
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
        index += 1
      }
      index += 1
      continue
    }

    output += char
  }

  return output
}

export function parseJsonc<T = unknown>(content: string): T {
  return JSON.parse(stripJsoncComments(content)) as T
}

export function parseJsoncSafe<T = unknown>(content: string): JsoncParseResult<T> {
  try {
    return { data: parseJsonc<T>(content) }
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}

export function readJsoncFile<T = unknown>(path: string): T {
  return parseJsonc<T>(readFileSync(path, "utf8"))
}

export function clearPluginConfigFileDetectionCache(): void {}

export function detectConfigFile(_options: DetectPluginConfigFileOptions = {}): string | undefined {
  return undefined
}

export function detectPluginConfigFile(_options: DetectPluginConfigFileOptions = {}): string | undefined {
  return undefined
}
