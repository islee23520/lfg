import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** Canonical shared-agents skill root Grok + lfg should always scan. */
export const AGENTS_SKILLS_PATH_ENTRY = "~/.agents/skills" as const

/**
 * Ensure `~/.grok/config.toml` has `[skills].paths` including `~/.agents/skills`.
 * Merges into any existing paths (does not drop user entries). Idempotent.
 *
 * Grok also walks `.agents/skills` at local/repo tiers natively; this makes the
 * user-home shared root explicit for slash discovery and lfg tooling.
 */
export async function ensureAgentsSkillsPath(
  home: string = homedir(),
): Promise<{ readonly path: string; readonly changed: boolean; readonly paths: readonly string[] }> {
  const path = join(home, ".grok", "config.toml")
  const current = await readTextIfExists(path)
  const existing = parseSkillsPaths(current)
  const merged = mergeUniquePathEntries(existing, [AGENTS_SKILLS_PATH_ENTRY])
  if (arraysEqual(existing, merged)) {
    return { path, changed: false, paths: merged }
  }
  const next = upsertSkillsPaths(current, merged)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, "utf8")
  return { path, changed: true, paths: merged }
}

/** Pure: merge path list for tests. */
export function mergeUniquePathEntries(existing: readonly string[], add: readonly string[]): string[] {
  const out = [...existing]
  const seen = new Set(existing.map(normalizePathEntry))
  for (const entry of add) {
    const key = normalizePathEntry(entry)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

export function parseSkillsPaths(source: string): string[] {
  const section = source.match(/\[skills\]\n([\s\S]*?)(?=\n\[[^\n]+\]|$)/)
  if (!section) return []
  const pathsMatch = section[1]?.match(/paths\s*=\s*\[([\s\S]*?)\]/)
  if (!pathsMatch) return []
  const inner = pathsMatch[1] ?? ""
  const paths: string[] = []
  for (const line of inner.split("\n")) {
    const m = line.match(/^\s*"([^"]+)"\s*,?\s*$/)
    if (m?.[1]) paths.push(m[1])
  }
  // Also support single-line: paths = ["a", "b"]
  if (paths.length === 0) {
    for (const m of inner.matchAll(/"([^"]+)"/g)) {
      if (m[1]) paths.push(m[1])
    }
  }
  return paths
}

function upsertSkillsPaths(source: string, paths: readonly string[]): string {
  const pathsBlock =
    paths.length === 0
      ? "paths = []"
      : `paths = [\n${paths.map((p) => `    ${tomlString(p)},`).join("\n")}\n]`
  const sectionPattern = /(^|\n)(\[skills\]\n)([\s\S]*?)(?=\n\[[^\n]+\]|$)/
  if (sectionPattern.test(source)) {
    return source.replace(sectionPattern, (_match, prefix: string, header: string, body: string) => {
      const nextBody = upsertPathsInSectionBody(body, pathsBlock)
      return `${prefix.startsWith("\n") ? "\n" : ""}${header}${nextBody}`
    })
  }
  const block = `[skills]\n${pathsBlock}\n`
  const trimmed = source.trimEnd()
  return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`
}

function upsertPathsInSectionBody(body: string, pathsBlock: string): string {
  const pathsPattern = /paths\s*=\s*\[[\s\S]*?\]\n?/
  if (pathsPattern.test(body)) {
    return body.replace(pathsPattern, `${pathsBlock}\n`)
  }
  return `${pathsBlock}\n${body}`
}

function normalizePathEntry(entry: string): string {
  return entry.trim().replace(/\/+$/, "").toLowerCase()
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw error
  }
}
