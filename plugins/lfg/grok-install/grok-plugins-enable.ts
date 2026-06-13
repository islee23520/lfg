import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const PLUGIN_IDS = ["lfg", "lazycodex"] as const

/** Ensure [plugins].enabled lists lfg (and lazycodex alias) so Grok loads adapter hooks. */
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
export async function ensureLfgSubagentModels(home: string = homedir(), mapping: { readonly default?: string; readonly reasoning?: string; readonly coding?: string } = {}): Promise<{ readonly path: string; readonly changed: boolean }> {
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
  const lines = parseEnabledArray(source)
  const merged = mergeUnique(lines, [...PLUGIN_IDS])
  if (arraysEqual(lines, merged)) {
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
  const toggles = new Map<string, boolean>([
    ["cursor", false],
    ["general-purpose", false],
    ["explore", false],
    ["browser-use", false],
    ["grok-build", false],
    ["builder", false],
    ["ulw", true],
    ["reasoning", true],
    ["coding", true],
    ["explorer", true],
    ["plan", true],
    ["librarian", true],
    ["metis", true],
    ["momus", true],
    ["reviewer", true],
  ])
  const block = [...toggles.entries()].map(([name, enabled]) => `${name} = ${enabled ? "true" : "false"}`).join("\n")
  return upsertTomlSection(source, "subagents.toggle", block)
}

function upsertAgentPreference(source: string): string {
  const disabled = ["cursor", "browser-use"] as const
  const block = `default = ${tomlString("ulw")}\ndisabled = [\n${disabled.map((id) => `    ${tomlString(id)},`).join("\n")}\n]`
  return upsertTomlSection(source, "agents", block)
}

/** LFG-owned [subagents.models] routing. Matches model-recommendations.ts + setup choices:
 * - explorer / librarian / general-purpose / explore / ulw → fast/default model
 * - plan / metis / momus / reasoning → reasoning model
 * - coding / grok-build / builder / reviewer → coding / non-reasoning model
 *
 * Note: LFG no longer bundles/writes shadow agents for Grok builtins (general-purpose, explore,
 * grok-build, builder, ulw). Real ultrawork agents (ulw, ultraresearch, feasible-goal, etc.)
 * come from the lazycodex plugin tree (components/ultrawork/agents via lfg internal install)
 * plus LFP-style per-agent overrides. The toggles and models routing below still apply to
 * whatever agents actually exist (from lazycodex/LFP or user).
 */
export function upsertSubagentModels(source: string, mapping: { readonly default?: string; readonly reasoning?: string; readonly coding?: string } = {}): string {
  const lfgOwned: Record<string, string> = {
    "general-purpose": mapping.default || "grok-3-mini-fast",
    "ulw": mapping.default || "grok-3-mini-fast",
    "plan": mapping.reasoning || "grok-4.20-0309-reasoning",
    "metis": mapping.reasoning || "grok-4.20-0309-non-reasoning",
    "momus": mapping.reasoning || "grok-4.20-0309-reasoning",
    "reasoning": mapping.reasoning || "grok-4.20-0309-reasoning",
    "explore": mapping.default || "grok-3-mini-fast",
    "explorer": mapping.default || "grok-3-mini-fast",
    "librarian": mapping.default || "grok-3-mini",
    "coding": mapping.coding || "grok-4.20-0309-non-reasoning",
    "grok-build": mapping.coding || "grok-4.20-0309-non-reasoning",
    "builder": mapping.coding || "grok-4.20-0309-non-reasoning",
    "reviewer": mapping.coding || "grok-4.3",
  }
  const block = Object.entries(lfgOwned)
    .map(([key, model]) => `${key} = ${tomlString(model)}`)
    .join("\n")
  // Uses upsertTomlSection (replaces section body). True merge for non-LFG keys is TODO.
  return upsertTomlSection(source, "subagents.models", block)
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