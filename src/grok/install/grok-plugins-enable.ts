import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { SubagentModelMapping } from "./subagent-routing"

const PLUGIN_IDS = ["lfg"] as const
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
  const next = upsertAgentPreference(removeRetiredAgentConfig(current))
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
  const merged = [...PLUGIN_IDS]
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

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
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
  return upsertStickyAgentName(source, "sisyphus")
}

/**
 * Sticky [agent].name is what headless/main sessions resolve first.
 * Preserve user-chosen agents; only set/replace when missing, empty, or known lfg-owned/stale.
 */
export function upsertStickyAgentName(source: string, _preferred: string = "sisyphus"): string {
  const current = readStickyAgentName(source)
  if (current !== null && current.length > 0 && !LFG_OWNED_OR_STALE_STICKY_AGENTS.has(current)) {
    return source
  }
  return current === null ? source : removeTomlSections(source, ["agent"])
}

export function readStickyAgentName(source: string): string | null {
  const section = source.match(/(?:^|\n)\[agent\]\n([\s\S]*?)(?=\n\[[^\n]+\]|$)/)
  if (section?.[1] === undefined) return null
  const match = section[1].match(/^\s*name\s*=\s*"([^"]*)"\s*$/m)
  return match?.[1] ?? null
}

export function upsertSubagentModels(
  source: string,
  _mapping: SubagentModelMapping = {},
): string {
  return removeTomlSections(source, ["subagents.models", "subagents.reasoning_effort"])
}

function removeRetiredAgentConfig(source: string): string {
  return removeTomlSections(source, [
    "subagents.reasoning_effort",
    "subagents.models",
    "subagents.toggle",
    "omo.backend_routing.agents",
    "omo.backend_routing.categories",
    "omo.backend_routing",
    "model.grok-build",
    'model."grok-build"',
    "agents",
  ])
}

function removeTomlSections(source: string, sections: readonly string[]): string {
  return sections.reduce((next, section) => {
    const pattern = new RegExp(`(^|\\n)\\[${escapeRegExp(section)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`, "g")
    return next.replace(pattern, (match) => (match.startsWith("\n") ? "\n" : ""))
  }, source).replace(/\n{3,}/g, "\n\n")
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
