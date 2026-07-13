import {
  isForeignProviderModel,
  isGrokFamilyModel,
  modelIsAvailable,
  pickRoleFallbacks,
  roleFallbackForAgent,
  shouldRemapUnavailableModel,
  type RoleModelFallback,
} from "./invalid-model-settings"

function shouldRemapModel(model: string, available: ReadonlySet<string>): boolean {
  // Keep intentional custom ids (custom-plan, ledger-explorer, user-model).
  // Remap foreign leftovers AND Grok-family ids missing from the host catalog.
  return shouldRemapUnavailableModel(model, available)
}

export type RemappedRoute = {
  readonly location: string
  readonly from: string
  readonly to: string
}

export type TomlPurgeResult = {
  readonly next: string
  readonly remappedRoutes: readonly RemappedRoute[]
  readonly removedModelSections: readonly string[]
  readonly removedPluginIds: readonly string[]
}

/**
 * Drop invalid model routes/sections from ~/.grok/config.toml text.
 * available: host cache + discovery ids (not every [model.*] name — those may themselves be stale).
 * installedPlugins: plugin ids present under plugins/ or installed-plugins/.
 */
export function purgeInvalidModelSettingsToml(
  source: string,
  available: ReadonlySet<string>,
  installedPlugins: ReadonlySet<string>,
): TomlPurgeResult {
  if (available.size === 0) {
    return { next: source, remappedRoutes: [], removedModelSections: [], removedPluginIds: [] }
  }
  const fallbacks = pickRoleFallbacks([...available])
  const remappedRoutes: RemappedRoute[] = []
  let next = source

  const removedModelSections: string[] = []
  for (const alias of listModelSectionAliases(next)) {
    if (shouldKeepModelSection(alias, next, available)) continue
    next = removeTomlSection(next, modelSectionName(alias))
    removedModelSections.push(alias)
  }

  const subagents = rewriteAssignmentSection(next, "subagents.models", (key, value) => {
    if (!shouldRemapModel(value, available)) return value
    const to = roleFallbackForAgent(key, fallbacks)
    remappedRoutes.push({ location: `subagents.models.${key}`, from: value, to })
    return to
  })
  next = subagents.next

  // Active agent namespace only. Retired [lazycodex.*] is stripped, not remapped.
  next = rewriteAgentModelSections(next, "omo.agents.", available, fallbacks, remappedRoutes)
  next = removeTomlSectionsByPrefix(next, "lazycodex")

  for (const section of ["omo.models", "models"] as const) {
    const roleKeys = new Set(["default", "fast", "reasoning", "coding"])
    const rewritten = rewriteAssignmentSection(next, section, (key, value) => {
      if (key === "available") return value
      if (!roleKeys.has(key) && section !== "models") return value
      if (key !== "default" && section === "models") return value
      if (!shouldRemapModel(value, available)) return value
      const to = roleFallbackForAgent(key, fallbacks)
      remappedRoutes.push({ location: `${section}.${key}`, from: value, to })
      return to
    })
    next = rewritten.next
  }

  const plugins = stripMissingPlugins(next, installedPlugins)
  return {
    next: plugins.next,
    remappedRoutes,
    removedModelSections,
    removedPluginIds: plugins.removed,
  }
}

export function listModelSectionAliases(source: string): readonly string[] {
  const out: string[] = []
  for (const line of source.split("\n")) {
    const match = /^\s*\[model\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+))\]\s*$/.exec(line)
    if (!match) continue
    const alias = match[1] ?? match[2] ?? match[3]
    if (alias) out.push(alias)
  }
  return out
}

export function removeTomlSection(source: string, section: string): string {
  const start = indexOfSectionHeader(source, section)
  if (start === -1) return source
  const end = nextSectionStart(source, start + 1)
  const before = source.slice(0, start)
  const after = source.slice(end)
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n")
}

function shouldKeepModelSection(alias: string, source: string, available: ReadonlySet<string>): boolean {
  // grok-build is the lfg install alias; always keep when any catalog exists.
  if (alias === "grok-build" || alias === "grok-build-0.1") return true
  if (modelIsAvailable(alias, available)) return true
  const body = readSectionBody(source, modelSectionName(alias))
  const upstream = readTomlStringField(body, "model")
  if (upstream !== null && modelIsAvailable(upstream, available)) return true
  // Drop foreign leftovers and Grok ids missing from the catalog. Keep intentional custom ids.
  if (isForeignProviderModel(alias) || isGrokFamilyModel(alias)) return false
  if (upstream !== null && (isForeignProviderModel(upstream) || isGrokFamilyModel(upstream))) return false
  return true
}

function removeTomlSectionsByPrefix(source: string, prefix: string): string {
  const lines = source.split("\n")
  const kept: string[] = []
  let dropping = false
  for (const line of lines) {
    const match = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (match?.[1]) {
      dropping = match[1].replace(/\s+/g, "").startsWith(prefix)
    }
    if (!dropping) kept.push(line)
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n")
}

function rewriteAgentModelSections(
  source: string,
  prefix: "omo.agents.",
  available: ReadonlySet<string>,
  fallbacks: RoleModelFallback,
  remappedRoutes: RemappedRoute[],
): string {
  let next = source
  for (const section of listSectionsWithPrefix(source, prefix)) {
    const agentName = section.slice(prefix.length)
    const body = readSectionBody(next, section)
    if (body === null) continue
    const out: string[] = []
    let keptModelFallback = false
    for (const line of body.split("\n")) {
      const parsed = parseAssignment(line)
      if (parsed === null) {
        out.push(line)
        continue
      }
      if (parsed.key !== "model" && parsed.key !== "model_fallback") {
        out.push(line)
        continue
      }
      const value = unquoteToml(parsed.value)
      if (value === null) {
        out.push(line)
        continue
      }
      if (!shouldRemapModel(value, available)) {
        if (parsed.key === "model_fallback") keptModelFallback = true
        out.push(line)
        continue
      }
      if (parsed.key === "model_fallback") {
        remappedRoutes.push({ location: `${section}.model_fallback`, from: value, to: "" })
        continue
      }
      const to = roleFallbackForAgent(agentName, fallbacks)
      remappedRoutes.push({ location: `${section}.model`, from: value, to })
      out.push(`model = ${tomlString(to)}`)
    }
    // Drop orphan model_fallback_* metadata when model_fallback itself was removed.
    const cleaned = keptModelFallback
      ? out
      : out.filter((line) => {
          const parsed = parseAssignment(line)
          return parsed === null || !parsed.key.startsWith("model_fallback")
        })
    next = replaceSectionBody(next, section, cleaned.join("\n"))
  }
  return next
}

function rewriteAssignmentSection(
  source: string,
  section: string,
  mapValue: (key: string, value: string) => string,
): { readonly next: string; readonly changed: boolean } {
  const body = readSectionBody(source, section)
  if (body === null) return { next: source, changed: false }
  let changed = false
  const lines = body.split("\n").map((line) => {
    const parsed = parseAssignment(line)
    if (parsed === null) return line
    const value = unquoteToml(parsed.value)
    if (value === null) return line
    const nextValue = mapValue(parsed.key, value)
    if (nextValue === value) return line
    changed = true
    return `${parsed.key} = ${tomlString(nextValue)}`
  })
  if (!changed) return { next: source, changed: false }
  return { next: replaceSectionBody(source, section, lines.join("\n")), changed: true }
}

export function stripMissingPlugins(
  source: string,
  installedPlugins: ReadonlySet<string>,
): { readonly next: string; readonly removed: readonly string[] } {
  const alwaysKeep = new Set(["lfg"])
  const section = source.match(/\[plugins\]\n([\s\S]*?)(?=\n\[[^\n]+\]|$)/)
  if (!section?.[1]) return { next: source, removed: [] }
  const enabledMatch = section[1].match(/enabled\s*=\s*\[([\s\S]*?)\]/)
  if (!enabledMatch?.[1]) return { next: source, removed: [] }
  const removed: string[] = []
  const kept: string[] = []
  // Multi-line or single-line: enabled = ["a", "b"] / enabled = [\n  "a",\n]
  for (const m of enabledMatch[1].matchAll(/"([^"]+)"/g)) {
    const id = m[1]!
    if (alwaysKeep.has(id) || installedPlugins.has(id)) kept.push(id)
    else removed.push(id)
  }
  if (removed.length === 0) return { next: source, removed: [] }
  const enabledBlock = `enabled = [\n${kept.map((id) => `    ${tomlString(id)},`).join("\n")}\n]`
  const nextBody = section[1].replace(/enabled\s*=\s*\[[\s\S]*?\]/, enabledBlock)
  return { next: source.replace(section[0], `[plugins]\n${nextBody}`), removed }
}

function listSectionsWithPrefix(source: string, prefix: string): readonly string[] {
  const out: string[] = []
  for (const line of source.split("\n")) {
    const match = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (!match?.[1]) continue
    const name = match[1].replace(/\s+/g, "")
    if (name.startsWith(prefix)) out.push(name)
  }
  return out
}

function readSectionBody(source: string, section: string): string | null {
  const start = indexOfSectionHeader(source, section)
  if (start === -1) return null
  const headerEnd = source.indexOf("\n", start)
  const bodyStart = headerEnd === -1 ? source.length : headerEnd + 1
  return source.slice(bodyStart, nextSectionStart(source, bodyStart))
}

function indexOfSectionHeader(source: string, section: string): number {
  const lines = source.split("\n")
  let offset = 0
  for (const line of lines) {
    if (line.trim() === `[${section}]`) return offset
    offset += line.length + 1
  }
  return -1
}

function replaceSectionBody(source: string, section: string, body: string): string {
  const start = indexOfSectionHeader(source, section)
  if (start === -1) return source
  const headerEnd = source.indexOf("\n", start)
  const bodyStart = headerEnd === -1 ? source.length : headerEnd + 1
  const end = nextSectionStart(source, bodyStart)
  const normalized = body.endsWith("\n") || body.length === 0 ? body : `${body}\n`
  return `${source.slice(0, bodyStart)}${normalized}${source.slice(end)}`
}

function nextSectionStart(source: string, from: number): number {
  const match = /\n\[[^\n]+]/.exec(source.slice(from))
  return match?.index === undefined ? source.length : from + match.index + 1
}

function modelSectionName(alias: string): string {
  return `model.${tomlString(alias)}`
}

function parseAssignment(line: string): { readonly key: string; readonly value: string } | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith("#")) return null
  const index = trimmed.indexOf("=")
  if (index <= 0) return null
  return { key: trimmed.slice(0, index).trim(), value: trimmed.slice(index + 1).trim() }
}

function unquoteToml(raw: string): string | null {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  if (raw.startsWith("[") || raw.startsWith("{")) return null
  return raw
}

function readTomlStringField(body: string | null, key: string): string | null {
  if (body === null) return null
  for (const line of body.split("\n")) {
    const parsed = parseAssignment(line)
    if (parsed?.key !== key) continue
    return unquoteToml(parsed.value)
  }
  return null
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}
