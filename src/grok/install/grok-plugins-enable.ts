import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { LFG_SUBAGENT_TOGGLES, lfgOwnedSubagentModels, lfgOwnedSubagentReasoningEffort, type SubagentModelMapping } from "./subagent-routing"

const PLUGIN_IDS = ["lfg"] as const
/** Legacy plugin id — never re-enable; strip if present in enabled. */
const RETIRED_PLUGIN_IDS = new Set(["lazycodex"])

/** Ensure [plugins].enabled lists lfg so Grok loads adapter hooks. Drops retired lazycodex id. */
export async function ensureLfgPluginsEnabled(home: string = homedir()): Promise<{ readonly path: string; readonly changed: boolean }> {
  const path = join(home, ".grok", "config.toml")
  const current = await readTextIfExists(path)
  const next = upsertPluginsEnabled(current)
  const changed = next !== current
  if (changed) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, next, "utf8")
  }
  return { path, changed }
}

export async function ensureLfgAgentsPreferred(home: string = homedir()): Promise<{ readonly path: string; readonly changed: boolean }> {
  const path = join(home, ".grok", "config.toml")
  const current = await readTextIfExists(path)
  const next = upsertAgentPreference(upsertSubagentToggles(current))
  const changed = next !== current
  if (changed) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, next, "utf8")
  }
  return { path, changed }
}

export async function ensureLfgSubagentModels(
  home: string = homedir(),
  mapping: SubagentModelMapping = {},
): Promise<{ readonly path: string; readonly changed: boolean }> {
  const path = join(home, ".grok", "config.toml")
  const current = await readTextIfExists(path)
  const next = upsertSubagentModels(current, mapping)
  const changed = next !== current
  if (changed) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, next, "utf8")
  }
  return { path, changed }
}

function upsertPluginsEnabled(source: string): string {
  const lines = parseEnabledArray(source).filter((id) => !RETIRED_PLUGIN_IDS.has(id))
  const merged = mergeUnique(lines, [...PLUGIN_IDS])
  if (arraysEqual(parseEnabledArray(source), merged)) {
    return source
  }
  const enabledBlock = `enabled = [\n${merged.map((id) => `    ${tomlString(id)},`).join("\n")}\n]`
  const sectionPattern = /(^|\n)(\[plugins\]\n)([\s\S]*?)(?=\n\[[^\n]+\]|$)/
  if (sectionPattern.test(source)) {
    return source.replace(sectionPattern, (_match, prefix: string, header: string, body: string) => {
      const nextBody = upsertEnabledInSectionBody(body, enabledBlock)
      return `${prefix.startsWith("\n") ? "\n" : ""}${header}${nextBody}`
    })
  }
  const block = `[plugins]\n${enabledBlock}\n`
  const trimmed = source.trimEnd()
  return trimmed.length === 0 ? `${block}` : `${trimmed}\n\n${block}`
}

function upsertEnabledInSectionBody(body: string, enabledBlock: string): string {
  const enabledPattern = /enabled\s*=\s*\[[\s\S]*?\]\n?/
  if (enabledPattern.test(body)) {
    return body.replace(enabledPattern, `${enabledBlock}\n`)
  }
  return `${enabledBlock}\n${body}`
}

function parseEnabledArray(source: string): string[] {
  const section = source.match(/\[plugins\]\n([\s\S]*?)(?=\n\[[^\n]+\]|$)/)
  if (!section) {
    return []
  }
  const enabledMatch = section[1]?.match(/enabled\s*=\s*\[([\s\S]*?)\]/)
  if (!enabledMatch) {
    return []
  }
  const inner = enabledMatch[1] ?? ""
  const ids: string[] = []
  for (const line of inner.split("\n")) {
    const m = line.match(/^\s*"([^"]+)"\s*,?\s*$/)
    if (m) {
      ids.push(m[1]!)
    }
  }
  return ids
}

function mergeUnique(existing: readonly string[], add: readonly string[]): string[] {
  const out = [...existing]
  for (const id of add) {
    if (!out.includes(id)) {
      out.push(id)
    }
  }
  return out
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function upsertSubagentToggles(source: string): string {
  const block = LFG_SUBAGENT_TOGGLES.map(([name, enabled]) => `${name} = ${enabled ? "true" : "false"}`).join("\n")
  return upsertTomlSection(source, "subagents.toggle", block)
}

/** lfg-owned / known-stale sticky agent names we may replace with sisyphus. */
const LFG_OWNED_OR_STALE_STICKY_AGENTS = new Set([
  "sisyphus",
  "ulw",
  "default",
  "hephaestus",
  "grok-build",
  "builder",
  "cursor",
  "browser-use",
])

function upsertAgentPreference(source: string): string {
  const disabled = ["default", "cursor", "browser-use"] as const
  const block = `default = ${tomlString("sisyphus")}\ndisabled = [\n${disabled.map((id) => `    ${tomlString(id)},`).join("\n")}\n]`
  const withAgents = upsertTomlSection(source, "agents", block)
  return upsertStickyAgentName(withAgents, "sisyphus")
}

/**
 * Sticky [agent].name is what headless/main sessions resolve first.
 * Preserve user-chosen agents; only set/replace when missing, empty, or known lfg-owned/stale.
 */
export function upsertStickyAgentName(source: string, preferred: string = "sisyphus"): string {
  const current = readStickyAgentName(source)
  if (current !== null && current.length > 0 && !LFG_OWNED_OR_STALE_STICKY_AGENTS.has(current)) {
    return source
  }
  return upsertTomlSection(source, "agent", `name = ${tomlString(preferred)}`)
}

export function readStickyAgentName(source: string): string | null {
  const section = source.match(/(?:^|\n)\[agent\]\n([\s\S]*?)(?=\n\[[^\n]+\]|$)/)
  if (section?.[1] === undefined) return null
  const match = section[1].match(/^\s*name\s*=\s*"([^"]*)"\s*$/m)
  return match?.[1] ?? null
}

export function upsertSubagentModels(
  source: string,
  mapping: SubagentModelMapping = {},
): string {
  const modelKeys = new Set(Object.keys(lfgOwnedSubagentModels(mapping)))
  const reasoningKeys = new Set(Object.keys(lfgOwnedSubagentReasoningEffort(mapping)))
  return removeOwnedAssignments(removeOwnedAssignments(source, "subagents.models", modelKeys), "subagents.reasoning_effort", reasoningKeys)
}

function removeOwnedAssignments(source: string, section: string, ownedKeys: ReadonlySet<string>): string {
  const pattern = new RegExp(`(^|\\n)(\\[${escapeRegExp(section)}\\]\\n)([\\s\\S]*?)(?=\\n\\[[^\\n]+\\]|$)`)
  return source.replace(pattern, (_match, prefix: string, header: string, body: string) => {
    const preserved = body.split("\n").filter((line) => {
      const key = parseTomlAssignmentKey(line.trim())
      return key === null || !ownedKeys.has(key)
    }).filter((line) => line.trim().length > 0)
    return preserved.length === 0 ? prefix : `${prefix}${header}${preserved.join("\n")}\n`
  }).replace(/\n{3,}/g, "\n\n")
}

function parseTomlAssignmentKey(line: string): string | null {
  const index = line.indexOf("=")
  if (index <= 0) return null
  const raw = line.slice(0, index).trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

function upsertTomlSection(source: string, section: string, body: string): string {
  const pattern = new RegExp(`(^|\\n)(\\[${escapeRegExp(section)}\\]\\n)([\\s\\S]*?)(?=\\n\\[[^\\n]+\\]|$)`)
  if (pattern.test(source)) {
    return source.replace(pattern, (_match, prefix: string, header: string) => `${prefix.startsWith("\n") ? "\n" : ""}${header}${body}\n`)
  }
  const trimmed = source.trimEnd()
  const block = `[${section}]\n${body}\n`
  return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return ""
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
