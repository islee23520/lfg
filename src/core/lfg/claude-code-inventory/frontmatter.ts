/** Minimal YAML frontmatter parser for SKILL.md / plugin.json companion fields. */

export function parseSkillFrontmatter(text: string): {
  readonly name: string | null
  readonly description: string | null
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) {
    return { name: null, description: null }
  }
  const body = match[1] ?? ""
  return {
    name: readScalar(body, "name"),
    description: readDescription(body),
  }
}

function readScalar(body: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m")
  const m = re.exec(body)
  if (m === null) return null
  return stripQuotes((m[1] ?? "").trim())
}

/** description may be a quoted scalar or a folded `>` / `|` block (first line only for inventory). */
function readDescription(body: string): string | null {
  const folded = /^description:\s*[>|][+-]?\s*\r?\n((?:[ \t]+.+\r?\n?)+)/m.exec(body)
  if (folded !== null) {
    const lines = (folded[1] ?? "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[ \t]+/, "").trim())
      .filter((line) => line.length > 0)
    const joined = lines.join(" ").trim()
    return joined.length > 0 ? truncate(joined, 400) : null
  }
  const scalar = /^description:\s*(.+)$/m.exec(body)
  if (scalar === null) return null
  const raw = stripQuotes((scalar[1] ?? "").trim())
  return raw.length > 0 ? truncate(raw, 400) : null
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}
