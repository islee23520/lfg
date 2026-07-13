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

/** T2: Ensures LFG-owned [subagents.models] routing (plan/metis/etc -> reasoning, explore->explorer, coding/grok-build/builder->coding; preserves non-LFG keys). Uses existing TOML upsert. */
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
  const disabled = ["cursor", "browser-use"] as const
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

/** LFG-owned [subagents.models] routing. Matches model-recommendations.ts + setup choices:
 * - explorer / librarian / general-purpose / explore / multimodal-looker → fast/default model
 * - sisyphus / prometheus / atlas / plan / metis / momus / reasoning → reasoning model
 * - coding / grok-build / builder / reviewer → coding / non-reasoning model
 *
 * Agents are adapted from the OMO opencode tree (sisyphus, prometheus, atlas, oracle,
 * hephaestus/default, multimodal-looker, sisyphus-junior, explore, librarian, metis, momus)
 * plus Grok-native convenience agents (reasoning, coding, plan, reviewer).
 */
export function upsertSubagentModels(
  source: string,
  mapping: SubagentModelMapping = {},
): string {
  const block = mergeSubagentModelBody(source, lfgOwnedSubagentModels(mapping))
  const withModels = upsertTomlSection(source, "subagents.models", block)
  return upsertTomlSection(withModels, "subagents.reasoning_effort", subagentReasoningBody(mapping))
}

function subagentReasoningBody(mapping: SubagentModelMapping): string {
  return Object.entries(lfgOwnedSubagentReasoningEffort(mapping)).map(([key, effort]) => `${key} = ${tomlString(effort)}`).join("\n")
}

function mergeSubagentModelBody(source: string, lfgOwned: Readonly<Record<string, string>>): string {
  const ownedKeys = new Set(Object.keys(lfgOwned))
  const preserved = subagentModelBody(source)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()
      if (trimmed.length === 0) return false
      const key = parseTomlAssignmentKey(trimmed)
      return key === null || !ownedKeys.has(key)
    })
  const ownedLines = Object.entries(lfgOwned).map(([key, model]) => `${key} = ${tomlString(model)}`)
  return [...preserved, ...ownedLines].join("\n")
}

function subagentModelBody(source: string): string {
  const match = /(^|\n)(\[subagents\.models\]\n)([\s\S]*?)(?=\n\[[^\n]+\]|$)/.exec(source)
  return match?.[3] ?? ""
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
