import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { parseSkillFrontmatter } from "./frontmatter"
import { resolveClaudeHome } from "./paths"
import type { ClaudeCodeInventoryOptions } from "./types"

export type ClaudeMemoryEntry = {
  readonly name: string
  readonly path: string
  readonly projectKey: string
  readonly projectPath: string | null
  readonly description: string | null
  readonly type: string | null
  readonly originSessionId: string | null
  readonly isIndex: boolean
  readonly mtimeMs: number | null
  readonly preview: string | null
}

export type ClaudeMemoryProject = {
  readonly projectKey: string
  readonly projectPath: string | null
  readonly memoryDir: string
  readonly entryCount: number
  readonly hasIndex: boolean
}

export type ClaudeMemoryInventory = {
  readonly ok: true
  readonly status: "claude_code_memory"
  readonly claudeHome: string
  readonly projects: readonly ClaudeMemoryProject[]
  readonly entries: readonly ClaudeMemoryEntry[]
  readonly projectCount: number
  readonly entryCount: number
}

/** Claude Code stores project dirs as absolute path with `/` → `-` (e.g. `/Users/a` → `-Users-a`). */
export function encodeClaudeProjectKey(cwd: string): string {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "")
  if (normalized.length === 0) return "-"
  return normalized.startsWith("/") ? normalized.replace(/\//g, "-") : `-${normalized.replace(/\//g, "-")}`
}

export function decodeClaudeProjectKey(projectKey: string): string | null {
  if (!projectKey.startsWith("-") || projectKey.length < 2) return null
  // -Users-foo-bar → /Users/foo/bar (best-effort; ambiguous if path segments contain dashes)
  return `/${projectKey.slice(1).replace(/-/g, "/")}`
}

export function scanClaudeMemories(options: ClaudeCodeInventoryOptions = {}): ClaudeMemoryInventory {
  const claudeHome = resolveClaudeHome(options)
  const projectsRoot = join(claudeHome, "projects")
  const projects: ClaudeMemoryProject[] = []
  const entries: ClaudeMemoryEntry[] = []

  if (!existsSync(projectsRoot)) {
    return {
      ok: true,
      status: "claude_code_memory",
      claudeHome,
      projects: [],
      entries: [],
      projectCount: 0,
      entryCount: 0,
    }
  }

  let projectKeys: string[]
  try {
    projectKeys = readdirSync(projectsRoot).filter((name) => {
      try {
        return statSync(join(projectsRoot, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    projectKeys = []
  }

  for (const projectKey of projectKeys) {
    const memoryDir = join(projectsRoot, projectKey, "memory")
    if (!existsSync(memoryDir)) continue
    const projectPath = decodeClaudeProjectKey(projectKey)
    const files = listMemoryFiles(memoryDir)
    projects.push({
      projectKey,
      projectPath,
      memoryDir,
      entryCount: files.length,
      hasIndex: files.some((f) => f.isIndex),
    })
    for (const file of files) {
      entries.push({
        ...file,
        projectKey,
        projectPath,
      })
    }
  }

  projects.sort((a, b) => a.projectKey.localeCompare(b.projectKey))
  entries.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))

  return {
    ok: true,
    status: "claude_code_memory",
    claudeHome,
    projects,
    entries,
    projectCount: projects.length,
    entryCount: entries.length,
  }
}

export function readClaudeMemory(
  nameOrPath: string,
  options: ClaudeCodeInventoryOptions = {},
): { readonly entry: ClaudeMemoryEntry; readonly body: string } | null {
  const needle = nameOrPath.trim()
  if (needle.length === 0) return null
  if (existsSync(needle) && needle.endsWith(".md")) {
    const body = safeRead(needle)
    if (body === null) return null
    const inv = scanClaudeMemories(options)
    const match = inv.entries.find((e) => e.path === needle)
    const entry =
      match ??
      ({
        name: basename(needle, ".md"),
        path: needle,
        projectKey: "",
        projectPath: null,
        description: null,
        type: null,
        originSessionId: null,
        isIndex: basename(needle).toUpperCase() === "MEMORY.MD",
        mtimeMs: null,
        preview: null,
      } satisfies ClaudeMemoryEntry)
    return { entry, body }
  }
  const inv = scanClaudeMemories(options)
  const lower = needle.toLowerCase()
  const found =
    inv.entries.find((e) => e.name.toLowerCase() === lower) ??
    inv.entries.find((e) => e.path.toLowerCase().endsWith(`/${lower}`) || e.path.toLowerCase().endsWith(`/${lower}.md`)) ??
    inv.entries.find((e) => e.name.toLowerCase().includes(lower))
  if (found === null || found === undefined) return null
  const body = safeRead(found.path)
  if (body === null) return null
  return { entry: found, body }
}

function listMemoryFiles(memoryDir: string): Omit<ClaudeMemoryEntry, "projectKey" | "projectPath">[] {
  let names: string[]
  try {
    names = readdirSync(memoryDir)
  } catch {
    return []
  }
  const out: Omit<ClaudeMemoryEntry, "projectKey" | "projectPath">[] = []
  for (const name of names) {
    if (!name.endsWith(".md") || name.startsWith(".")) continue
    const path = join(memoryDir, name)
    try {
      if (!statSync(path).isFile()) continue
    } catch {
      continue
    }
    const body = safeRead(path) ?? ""
    const fm = parseMemoryFrontmatter(body)
    let mtimeMs: number | null = null
    try {
      mtimeMs = statSync(path).mtimeMs
    } catch {
      mtimeMs = null
    }
    const isIndex = name.toUpperCase() === "MEMORY.MD"
    out.push({
      name: fm.name ?? basename(name, ".md"),
      path,
      description: fm.description,
      type: fm.type,
      originSessionId: fm.originSessionId,
      isIndex,
      mtimeMs,
      preview: previewText(body, isIndex ? 240 : 160),
    })
  }
  return out
}

function parseMemoryFrontmatter(text: string): {
  readonly name: string | null
  readonly description: string | null
  readonly type: string | null
  readonly originSessionId: string | null
} {
  const base = parseSkillFrontmatter(text)
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const block = match?.[1] ?? ""
  const type =
    /(?:^|\n)type:\s*(.+)$/m.exec(block)?.[1]?.trim().replace(/^["']|["']$/g, "") ??
    /(?:^|\n)\s+type:\s*(.+)$/m.exec(block)?.[1]?.trim().replace(/^["']|["']$/g, "") ??
    null
  const originSessionId =
    /(?:^|\n)\s*originSessionId:\s*(.+)$/m.exec(block)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null
  return {
    name: base.name,
    description: base.description,
    type,
    originSessionId,
  }
}

function previewText(body: string, max: number): string | null {
  const stripped = body.replace(/^---[\s\S]*?---\r?\n?/, "").trim()
  if (stripped.length === 0) return null
  if (stripped.length <= max) return stripped
  return `${stripped.slice(0, max - 1)}…`
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return null
  }
}
