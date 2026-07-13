import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { parseSkillFrontmatter } from "./frontmatter"
import {
  agentsSkillsDir,
  claudePluginsDir,
  claudeProjectSkillsDir,
  claudeSettingsPath,
  claudeUserSkillsDir,
  installedPluginsPath,
  knownMarketplacesPath,
  resolveClaudeHome,
} from "./paths"
import type {
  ClaudeCodeInventory,
  ClaudeCodeInventoryOptions,
  ClaudeMarketplaceInfo,
  ClaudePluginInfo,
  ClaudeSkillInfo,
  ClaudeSkillSource,
} from "./types"

export function scanClaudeCodeInventory(options: ClaudeCodeInventoryOptions = {}): ClaudeCodeInventory {
  const claudeHome = resolveClaudeHome(options)
  const claudeHomeExists = existsSync(claudeHome)
  const includeAgents = options.includeAgentsSkills !== false
  const includeMarketplacePlugins = options.includeMarketplacePlugins !== false
  const includeMarketplaceSkills = options.includeMarketplaceSkills === true

  const enabledPluginIds = new Set(readEnabledPluginIds(claudeHome))
  const marketplaces = readMarketplaces(claudeHome)
  const plugins: ClaudePluginInfo[] = []
  const skills: ClaudeSkillInfo[] = []

  // User + shared + project skills (always on)
  skills.push(...scanSkillRoot(claudeUserSkillsDir(claudeHome), "claude-user", null, null))
  if (includeAgents) {
    skills.push(...scanSkillRoot(agentsSkillsDir(options), "agents-shared", null, null))
  }
  const projectRoot = options.projectRoot?.trim()
  if (projectRoot && projectRoot.length > 0) {
    skills.push(...scanSkillRoot(claudeProjectSkillsDir(projectRoot), "claude-project", null, null))
  }

  // Marketplace plugins
  if (includeMarketplacePlugins) {
    for (const mp of marketplaces) {
      if (mp.installLocation === null || !existsSync(mp.installLocation)) continue
      const found = scanMarketplacePlugins(mp.id, mp.installLocation, enabledPluginIds)
      plugins.push(...found.plugins)
      if (includeMarketplaceSkills) {
        skills.push(...found.skills)
      }
    }
  }

  // installed_plugins.json entries (path-based install records)
  plugins.push(...scanInstalledPluginsRegistry(claudeHome, enabledPluginIds, plugins))

  // De-dupe skills by path; plugins by marketplace+name+path
  const skillByPath = new Map<string, ClaudeSkillInfo>()
  for (const skill of skills) {
    skillByPath.set(skill.path, skill)
  }
  const pluginKey = (p: ClaudePluginInfo) => `${p.marketplace ?? ""}::${p.name}::${p.path}`
  const pluginByKey = new Map<string, ClaudePluginInfo>()
  for (const plugin of plugins) {
    pluginByKey.set(pluginKey(plugin), plugin)
  }

  const skillList = [...skillByPath.values()].sort((a, b) => a.name.localeCompare(b.name))
  const pluginList = [...pluginByKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  const settings = readSettingsSummary(claudeHome)

  return {
    ok: true,
    status: "claude_code_inventory",
    claudeHome,
    claudeHomeExists,
    skills: skillList,
    plugins: pluginList,
    marketplaces,
    skillCount: skillList.length,
    pluginCount: pluginList.length,
    marketplaceCount: marketplaces.length,
    enabledPluginCount: pluginList.filter((p) => p.enabled).length,
    settings,
  }
}

export function findClaudeSkill(
  name: string,
  options: ClaudeCodeInventoryOptions = {},
): ClaudeSkillInfo | null {
  const needle = name.trim().toLowerCase()
  if (needle.length === 0) return null
  const inv = scanClaudeCodeInventory({ ...options, includeMarketplaceSkills: true })
  return (
    inv.skills.find((s) => s.name.toLowerCase() === needle || s.dirName.toLowerCase() === needle) ??
    null
  )
}

export function findClaudePlugin(
  name: string,
  options: ClaudeCodeInventoryOptions = {},
): ClaudePluginInfo | null {
  const needle = name.trim().toLowerCase()
  if (needle.length === 0) return null
  const inv = scanClaudeCodeInventory(options)
  return inv.plugins.find((p) => p.name.toLowerCase() === needle) ?? null
}

export function readClaudeSkillBody(
  name: string,
  options: ClaudeCodeInventoryOptions = {},
): { readonly skill: ClaudeSkillInfo; readonly skillMd: string } | null {
  const skill = findClaudeSkill(name, options)
  if (skill === null) return null
  const skillMdPath = join(skill.path, "SKILL.md")
  if (!existsSync(skillMdPath)) return null
  try {
    const skillMd = readFileSync(skillMdPath, "utf8")
    return { skill, skillMd }
  } catch {
    return null
  }
}

function scanSkillRoot(
  root: string,
  source: ClaudeSkillSource,
  marketplace: string | null,
  plugin: string | null,
): ClaudeSkillInfo[] {
  if (!existsSync(root)) return []
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }
  const out: ClaudeSkillInfo[] = []
  for (const entry of entries) {
    if (entry.startsWith(".")) continue
    const dir = join(root, entry)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const skillMd = join(dir, "SKILL.md")
    if (!existsSync(skillMd)) continue
    let text = ""
    try {
      text = readFileSync(skillMd, "utf8")
    } catch {
      continue
    }
    const fm = parseSkillFrontmatter(text)
    out.push({
      name: fm.name ?? entry,
      dirName: entry,
      path: dir,
      description: fm.description,
      source,
      marketplace,
      plugin,
      hasReferences: existsSync(join(dir, "references")),
      hasScripts: existsSync(join(dir, "scripts")),
    })
  }
  return out
}

function scanMarketplacePlugins(
  marketplaceId: string,
  installLocation: string,
  enabled: ReadonlySet<string>,
): { readonly plugins: ClaudePluginInfo[]; readonly skills: ClaudeSkillInfo[] } {
  const plugins: ClaudePluginInfo[] = []
  const skills: ClaudeSkillInfo[] = []
  const roots = [
    join(installLocation, "plugins"),
    join(installLocation, "external_plugins"),
    installLocation,
  ]
  const seenDirs = new Set<string>()
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const pluginDir of listPluginDirs(root)) {
      if (seenDirs.has(pluginDir)) continue
      seenDirs.add(pluginDir)
      const manifest = readPluginManifest(pluginDir)
      if (manifest === null) continue
      const skillInfos = scanSkillRoot(join(pluginDir, "skills"), "plugin-marketplace", marketplaceId, manifest.name)
      // some plugins put skills at root
      if (skillInfos.length === 0 && existsSync(join(pluginDir, "SKILL.md"))) {
        // single-skill plugin root — rare
      }
      skills.push(...skillInfos)
      // also skills nested one level under plugin
      if (skillInfos.length === 0) {
        skills.push(...scanSkillRoot(pluginDir, "plugin-marketplace", marketplaceId, manifest.name))
      }
      plugins.push({
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
        path: pluginDir,
        marketplace: marketplaceId,
        sourceKind: enabled.has(manifest.name) || enabled.has(`${marketplaceId}:${manifest.name}`) ? "enabled" : "marketplace",
        enabled: enabled.has(manifest.name) || enabled.has(`${marketplaceId}:${manifest.name}`),
        skillCount: skillInfos.length,
        skills: skillInfos.map((s) => s.name),
        keywords: manifest.keywords,
      })
    }
  }
  return { plugins, skills }
}

function listPluginDirs(root: string): string[] {
  // root may itself be a marketplace with plugins/* dirs
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue
    const dir = join(root, entry)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (hasPluginManifest(dir)) {
      out.push(dir)
      continue
    }
    // one level deeper (plugins/foo)
    let nested: string[]
    try {
      nested = readdirSync(dir)
    } catch {
      continue
    }
    for (const child of nested) {
      if (child.startsWith(".")) continue
      const nestedDir = join(dir, child)
      try {
        if (!statSync(nestedDir).isDirectory()) continue
      } catch {
        continue
      }
      if (hasPluginManifest(nestedDir)) out.push(nestedDir)
    }
  }
  return out
}

function hasPluginManifest(dir: string): boolean {
  return (
    existsSync(join(dir, ".claude-plugin", "plugin.json")) ||
    existsSync(join(dir, "plugin.json")) ||
    existsSync(join(dir, ".claude-plugin", "marketplace.json"))
  )
}

function readPluginManifest(dir: string): {
  readonly name: string
  readonly description: string | null
  readonly version: string | null
  readonly author: string | null
  readonly keywords: readonly string[]
} | null {
  const candidates = [join(dir, ".claude-plugin", "plugin.json"), join(dir, "plugin.json")]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
      if (!isRecord(raw)) continue
      const name =
        typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : basename(dir)
      const description = typeof raw.description === "string" ? raw.description : null
      const version = typeof raw.version === "string" ? raw.version : null
      const author = readAuthor(raw.author)
      const keywords = Array.isArray(raw.keywords)
        ? raw.keywords.filter((k): k is string => typeof k === "string")
        : []
      return { name, description, version, author, keywords }
    } catch {
      continue
    }
  }
  // skill-only directory with SKILL.md as weak plugin
  if (existsSync(join(dir, "SKILL.md"))) {
    return { name: basename(dir), description: null, version: null, author: null, keywords: [] }
  }
  return null
}

function readAuthor(value: unknown): string | null {
  if (typeof value === "string") return value
  if (isRecord(value) && typeof value.name === "string") return value.name
  return null
}

function readMarketplaces(claudeHome: string): ClaudeMarketplaceInfo[] {
  const path = knownMarketplacesPath(claudeHome)
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!isRecord(raw)) return []
    const out: ClaudeMarketplaceInfo[] = []
    for (const [id, value] of Object.entries(raw)) {
      if (!isRecord(value)) continue
      const installLocation =
        typeof value.installLocation === "string" ? value.installLocation : null
      const lastUpdated = typeof value.lastUpdated === "string" ? value.lastUpdated : null
      const sourceLabel = sourceToLabel(value.source)
      let pluginCount = 0
      if (installLocation !== null && existsSync(installLocation)) {
        pluginCount = listPluginDirs(join(installLocation, "plugins")).length
          + listPluginDirs(join(installLocation, "external_plugins")).length
      }
      out.push({
        id,
        installLocation,
        lastUpdated,
        sourceLabel,
        pluginCount,
      })
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

function sourceToLabel(source: unknown): string | null {
  if (!isRecord(source)) return null
  if (typeof source.repo === "string") {
    const kind = typeof source.source === "string" ? source.source : "repo"
    return `${kind}:${source.repo}`
  }
  if (typeof source.source === "string") return source.source
  return null
}

function scanInstalledPluginsRegistry(
  claudeHome: string,
  enabled: ReadonlySet<string>,
  already: readonly ClaudePluginInfo[],
): ClaudePluginInfo[] {
  const path = installedPluginsPath(claudeHome)
  if (!existsSync(path)) return []
  const alreadyNames = new Set(already.map((p) => p.name.toLowerCase()))
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!isRecord(raw)) return []
    const plugins = isRecord(raw.plugins) ? raw.plugins : raw
    if (!isRecord(plugins)) return []
    const out: ClaudePluginInfo[] = []
    for (const [name, value] of Object.entries(plugins)) {
      if (alreadyNames.has(name.toLowerCase())) continue
      const installPath =
        isRecord(value) && typeof value.installPath === "string"
          ? value.installPath
          : isRecord(value) && typeof value.path === "string"
            ? value.path
            : join(claudePluginsDir(claudeHome), name)
      const manifest = existsSync(installPath) ? readPluginManifest(installPath) : null
      out.push({
        name: manifest?.name ?? name,
        description: manifest?.description ?? null,
        version: manifest?.version ?? (isRecord(value) && typeof value.version === "string" ? value.version : null),
        author: manifest?.author ?? null,
        path: installPath,
        marketplace: isRecord(value) && typeof value.marketplace === "string" ? value.marketplace : null,
        sourceKind: "installed",
        enabled: enabled.has(name) || enabled.has(manifest?.name ?? name),
        skillCount: 0,
        skills: [],
        keywords: manifest?.keywords ?? [],
      })
    }
    return out
  } catch {
    return []
  }
}

function readEnabledPluginIds(claudeHome: string): string[] {
  const settings = readSettingsJson(claudeHome)
  if (settings === null) return []
  const enabled = settings.enabledPlugins
  if (Array.isArray(enabled)) {
    return enabled.filter((x): x is string => typeof x === "string")
  }
  if (isRecord(enabled)) {
    return Object.entries(enabled)
      .filter(([, v]) => v === true || v === "true" || v === 1)
      .map(([k]) => k)
  }
  return []
}

function readSettingsSummary(claudeHome: string): ClaudeCodeInventory["settings"] {
  const path = claudeSettingsPath(claudeHome)
  if (!existsSync(path)) {
    return {
      path: null,
      exists: false,
      model: null,
      enabledPluginIds: [],
      envKeys: [],
      permissionDefaultMode: null,
    }
  }
  const raw = readSettingsJson(claudeHome)
  if (raw === null) {
    return {
      path,
      exists: true,
      model: null,
      enabledPluginIds: [],
      envKeys: [],
      permissionDefaultMode: null,
    }
  }
  const envKeys =
    isRecord(raw.env) ? Object.keys(raw.env).sort() : []
  // NEVER expose env values (tokens, API keys)
  const permissionDefaultMode =
    isRecord(raw.permissions) && typeof raw.permissions.defaultMode === "string"
      ? raw.permissions.defaultMode
      : null
  return {
    path,
    exists: true,
    model: typeof raw.model === "string" ? raw.model : null,
    enabledPluginIds: readEnabledPluginIds(claudeHome),
    envKeys,
    permissionDefaultMode,
  }
}

function readSettingsJson(claudeHome: string): Record<string, unknown> | null {
  const path = claudeSettingsPath(claudeHome)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
    return isRecord(raw) ? raw : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
