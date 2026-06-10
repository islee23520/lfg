import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAgentOverrideMap } from "./lazycodex-agent-overrides"
import { overrideForAgent } from "./lazycodex-agent-overrides"
import { renderGrokRoleTomlFromCodex, renderMinimalGrokRoleToml } from "./codex-agent-toml-to-grok"
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset"

const ULTRAWORK_AGENTS_DIR = join("components", "ultrawork", "agents")

export type SyncLazycodexAgentsResult = {
  readonly ok: true
  readonly agentsDir: string
  readonly promptsDir: string
  readonly written: readonly string[]
  readonly sourcePluginRoot: string
}

/** Install lazycodex/omo agent definitions into ~/.grok/agents as Grok-compatible role TOMLs. */
const EXTRA_ROLE_ONLY_AGENTS = ["reasoning", "coding"] as const

export async function syncLazycodexAgentsToGrokLedger(
  home: string,
  agentOverrides: LazycodexAgentOverrideMap,
): Promise<SyncLazycodexAgentsResult | null> {
  const resolved = await resolveGrokAdapterPluginRoot(home)
  if (resolved === null) {
    return null
  }
  const sourceDir = join(resolved.pluginRoot, ULTRAWORK_AGENTS_DIR)
  let entries: string[]
  try {
    entries = await readdir(sourceDir)
  } catch {
    return null
  }
  const agentsDir = join(home, ".grok", "agents")
  const promptsDir = join(home, ".grok", "prompts", "lazycodex")
  await mkdir(agentsDir, { recursive: true })
  await mkdir(promptsDir, { recursive: true })
  const written: string[] = []
  for (const fileName of entries) {
    if (!fileName.endsWith(".toml")) {
      continue
    }
    const baseName = fileName.slice(0, -".toml".length)
    const codexText = await readFile(join(sourceDir, fileName), "utf8")
    const override = overrideForAgent(agentOverrides, baseName)
    const rendered = renderGrokRoleTomlFromCodex(codexText, baseName, override, promptsDir)
    const dest = join(agentsDir, fileName)
    await writeFile(dest, rendered.toml, "utf8")
    written.push(dest)
    if (rendered.promptPath !== null && rendered.promptBody !== null) {
      await writeFile(rendered.promptPath, rendered.promptBody, "utf8")
    }
  }
  const syncedNames = new Set(entries.filter((e) => e.endsWith(".toml")).map((e) => e.slice(0, -5)))
  for (const name of EXTRA_ROLE_ONLY_AGENTS) {
    if (syncedNames.has(name)) {
      continue
    }
    const override = overrideForAgent(agentOverrides, name)
    if (override === undefined) {
      continue
    }
    const path = join(agentsDir, `${name}.toml`)
    await writeFile(path, renderMinimalGrokRoleToml(name, override), "utf8")
    written.push(path)
  }
  // Sync flavour-pack agents (artistry, visual, etc.) from bundled assets
  const flavourPackAgentsDir = await resolveFlavourPackAssetsRoot(import.meta.url)
  const flavourAgentConfigs = join(flavourPackAgentsDir, "agent-configs")
  let flavourEntries: string[]
  try {
    flavourEntries = await readdir(flavourAgentConfigs)
  } catch {
    flavourEntries = []
  }
  for (const fileName of flavourEntries) {
    if (!fileName.endsWith(".toml")) {
      continue
    }
    const baseName = fileName.slice(0, -".toml".length)
    if (syncedNames.has(baseName)) {
      continue
    }
    const codexText = await readFile(join(flavourAgentConfigs, fileName), "utf8")
    const override = overrideForAgent(agentOverrides, baseName)
    const rendered = renderGrokRoleTomlFromCodex(codexText, baseName, override, promptsDir)
    const dest = join(agentsDir, fileName)
    await writeFile(dest, rendered.toml, "utf8")
    written.push(dest)
    if (rendered.promptPath !== null && rendered.promptBody !== null) {
      await writeFile(rendered.promptPath, rendered.promptBody, "utf8")
    }
    syncedNames.add(baseName)
  }

  return { ok: true, agentsDir, promptsDir, written, sourcePluginRoot: resolved.pluginRoot }
}