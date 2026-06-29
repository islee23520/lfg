export function isBareKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key)
}

export function upsertSection(source: string, section: string, lines: readonly string[]): string {
  const block = `[${section}]\n${lines.join("\n")}\n`
  if (makeSectionRegex(section).test(source)) {
    let replaced = false
    return source.replace(makeSectionRegex(section, "g"), (match: string) => {
      const prefix = match.startsWith("\n") ? "\n" : ""
      if (replaced) {
        return prefix
      }
      replaced = true
      return `${prefix}${block}`
    })
  }
  const trimmed = source.trimEnd()
  return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`
}

export function removeTomlKey(source: string, section: string, key: string): string {
  const header = `[${section}]`
  const start = source.indexOf(header)
  if (start === -1) {
    return source
  }
  const end = nextSectionStart(source, start + header.length)
  const before = source.slice(0, start)
  const body = source.slice(start, end)
  const after = source.slice(end)
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "m")
  const lines = body.split("\n").filter((line) => !pattern.test(line))
  return `${before}${lines.join("\n")}${after}`
}

export function removeTomlSectionsByPrefix(source: string, prefix: string): string {
  const lines = source.split("\n")
  const kept: string[] = []
  let dropping = false
  for (const line of lines) {
    const section = parseSectionHeader(line)
    if (section !== null) {
      dropping = section.startsWith(prefix)
    }
    if (!dropping) {
      kept.push(line)
    }
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n")
}

export function upsertTomlKey(source: string, section: string, key: string, value: string): string {
  const header = `[${section}]`
  const start = source.indexOf(header)
  if (start === -1) {
    return upsertSection(source, section, [`${key} = ${tomlString(value)}`])
  }
  const end = nextSectionStart(source, start + header.length)
  const before = source.slice(0, start)
  const body = source.slice(start, end)
  const after = source.slice(end)
  return `${before}${upsertSectionBody(body, key, value)}${after}`
}

export function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function parseKeyPath(section: string): string[] {
  const parts: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < section.length; i++) {
    const char = section[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "." && !inQuotes) {
      parts.push(current)
      current = ""
    } else {
      current += char
    }
  }
  if (current.length > 0 || parts.length === 0) {
    parts.push(current)
  }
  return parts
}

function makeKeyPattern(part: string): string {
  const escaped = escapeRegExp(part)
  if (isBareKey(part)) {
    return `(?:"${escaped}"|'${escaped}'|${escaped})`
  }
  return `(?:"${escaped}"|'${escaped}')`
}

function makeSectionRegex(section: string, flags = ""): RegExp {
  const parts = parseKeyPath(section)
  const partPatterns = parts.map(makeKeyPattern)
  const patternStr = `(^|\\n)\\[\\s*${partPatterns.join("\\s*\\.\\s*")}\\s*\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`
  return new RegExp(patternStr, flags)
}

function nextSectionStart(source: string, from: number): number {
  const match = /\n\[[^\n]+]/.exec(source.slice(from))
  return match?.index === undefined ? source.length : from + match.index + 1
}

function parseSectionHeader(line: string): string | null {
  const match = /^\s*\[([^\]]+)]\s*$/.exec(line)
  return match?.[1]?.replace(/\s+/g, "") ?? null
}

function upsertSectionBody(body: string, key: string, value: string): string {
  const replacement = `${key} = ${tomlString(value)}`
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=`)
  const lines = body.split("\n")
  const replaced = lines.map((line) => (pattern.test(line.trimStart()) ? replacement : line))
  if (replaced.includes(replacement)) {
    return replaced.join("\n")
  }
  const insertAt = replaced.length > 0 && replaced[replaced.length - 1] === "" ? replaced.length - 1 : replaced.length
  replaced.splice(insertAt, 0, replacement)
  return replaced.join("\n")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
