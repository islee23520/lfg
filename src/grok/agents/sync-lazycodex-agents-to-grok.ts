import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap } from "./lazycodex-agent-overrides"
import { overrideForAgent } from "./lazycodex-agent-overrides"
import { renderGrokRoleTomlFromCodex, renderMinimalGrokRoleToml } from "./codex-agent-toml-to-grok"
import { nativeAgentDescription, nativeOmoFallbackPrompt } from "./native-omo-agents"
import {
  isReadOnlyNativeAgent,
  nativeAgentPermissionMode,
  nativeAgentPermissionPolicyBlock,
} from "./native-agent-permissions"
import { resolveGrokAdapterPluginRoot } from "../payload/grok-adapter-paths"
import { renderYamlDoubleQuotedScalar } from "../models/model-id-safety"
import { resolveFlavourPackAssetsRoot } from "../payload/resolve-flavour-pack-asset"

/** Fallback model routing when bundled/user overrides omit a native OMO agent. */
const DEFAULT_NATIVE_AGENT_OVERRIDE: LazycodexAgentModelOverride = {
  model: "inherit",
  reasoningLevel: "medium",
}

const ULTRAWORK_AGENTS_DIR = join("components", "ultrawork", "agents")
const GROK_BUILTIN_AGENT_NAMES = [] as const
const RETIRED_SHADOW_AGENT_NAMES = ["general-purpose", "explore", "plan", "grok-build", "builder"] as const

/**
 * Maps codex component/ultrawork agent TOML names to Grok agent names.
 * Default install: slim native design (CEO + worker + explorer + git-master).
 * Agents without a source TOML receive lfg-owned fallback prompts.
 */
const GROK_AGENT_NAMES: Readonly<Record<string, string>> = {
  sisyphus: "sisyphus",
}

const RETIRED_GROK_AGENT_NAMES = [
  "default", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "metis", "momus",
  "multimodal-looker", "visual-looker", "sisyphus-junior", "reasoning", "coding", "plan", "reviewer",
  "ultrabrain", "deep", "quick", "unspecified-low", "unspecified-high", "writing", "visual-engineering",
  "artistry", "artistry-gen", "artistry-qa", "ulw", "lazycodex", "lazycodex-worker-low", "lazycodex-worker-medium",
  "lazycodex-worker-high", "watcher", "explorer", "git-master",
] as const

export type SyncLazycodexAgentsResult = {
  readonly ok: true
  readonly agentsDir: string
  readonly rolesDir: string
  readonly personasDir: string
  readonly promptsDir: string
  readonly written: readonly string[]
  readonly sourcePluginRoot: string
}

export async function syncLazycodexAgentsToGrokLedger(
  home: string,
  agentOverrides: LazycodexAgentOverrideMap,
): Promise<SyncLazycodexAgentsResult | null> {
  const resolved = await resolveGrokAdapterPluginRoot(home)
  if (resolved === null) return null

  const sourceDir = join(resolved.pluginRoot, ULTRAWORK_AGENTS_DIR)
  const entries = ((await readTomlEntries(sourceDir)) ?? []).filter((fileName) =>
    Object.hasOwn(GROK_AGENT_NAMES, fileName.slice(0, -".toml".length)),
  )

  const agentsDir = join(resolved.pluginRoot, "agents")
  const rolesDir = join(home, ".grok", "roles")
  const personasDir = join(home, ".grok", "personas")
  const promptsDir = join(home, ".grok", "prompts", "omo")
  await mkdir(agentsDir, { recursive: true })
  await mkdir(rolesDir, { recursive: true })
  await mkdir(personasDir, { recursive: true })
  await mkdir(promptsDir, { recursive: true })
  await migrateLegacyLazycodexPrompts(home)
  await removeRetiredGrokAgentSurfaces({ agentsDir, rolesDir, personasDir, promptsDir })
  await removeBuiltinShadowAgents(agentsDir)
  await moveConflictingUserAgentsAside(home, [...RETIRED_GROK_AGENT_NAMES, ...conflictingUserAgentNames()])

  const written: string[] = []
  const syncedNames = new Set<string>()
  for (const fileName of entries) {
    const sourceName = fileName.slice(0, -".toml".length)
    const grokName = GROK_AGENT_NAMES[sourceName] ?? sourceName
    const codexText = await readFile(join(sourceDir, fileName), "utf8")
    const override = overrideForAgent(agentOverrides, sourceName)
    written.push(...(await writeMappedAgentSurfaces({ codexText, sourceName, grokName, override, agentsDir, rolesDir, personasDir, promptsDir })))
    syncedNames.add(sourceName)
  }

  const flavourRoot = await resolveFlavourPackAssetsRoot(import.meta.url)
  const flavourEntries = (await readTomlEntries(join(flavourRoot, "agent-configs")))?.filter((fileName) =>
    Object.hasOwn(GROK_AGENT_NAMES, fileName.slice(0, -".toml".length)),
  )
  for (const fileName of flavourEntries ?? []) {
    const sourceName = fileName.slice(0, -".toml".length)
    if (syncedNames.has(sourceName)) continue
    const grokName = sourceName
    const codexText = await readFile(join(flavourRoot, "agent-configs", fileName), "utf8")
    const override = overrideForAgent(agentOverrides, sourceName)
    written.push(...(await writeMappedAgentSurfaces({ codexText, sourceName, grokName, override, agentsDir, rolesDir, personasDir, promptsDir })))
    syncedNames.add(sourceName)
  }

  for (const [sourceName, grokName] of Object.entries(GROK_AGENT_NAMES)) {
    if (syncedNames.has(sourceName)) continue
    const override = overrideForAgent(agentOverrides, sourceName) ?? DEFAULT_NATIVE_AGENT_OVERRIDE
    written.push(...(await writeMinimalAgentSurfaces({ sourceName, grokName, override, agentsDir, rolesDir, promptsDir })))
  }

  written.push(...(await installPreferredUserScopedAgents(home, agentsDir)))

  return { ok: true, agentsDir, rolesDir, personasDir, promptsDir, written, sourcePluginRoot: resolved.pluginRoot }
}

const PREFERRED_USER_SCOPED_AGENT_NAMES = ["sisyphus"] as const

async function installPreferredUserScopedAgents(home: string, pluginAgentsDir: string): Promise<string[]> {
  const userAgentsDir = join(home, ".grok", "agents")
  await mkdir(userAgentsDir, { recursive: true })
  const installed: string[] = []
  for (const name of PREFERRED_USER_SCOPED_AGENT_NAMES) {
    const source = join(pluginAgentsDir, `${name}.md`)
    const dest = join(userAgentsDir, `${name}.md`)
    try {
      const body = await readFile(source, "utf8")
      await writeFile(dest, body, "utf8")
      installed.push(dest)
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error
    }
  }
  return installed
}

async function writeMappedAgentSurfaces(args: {
  readonly codexText: string
  readonly sourceName: string
  readonly grokName: string
  readonly override: ReturnType<typeof overrideForAgent>
  readonly agentsDir: string
  readonly rolesDir: string
  readonly personasDir: string
  readonly promptsDir: string
}): Promise<string[]> {
  const meta = parseCodexAgentMeta(args.codexText)
  const role = renderGrokRoleTomlFromCodex(args.codexText, args.grokName, args.override, args.promptsDir)
  const prompt = role.promptBody ?? `${meta.instructions}\n`
  const promptPath = join(args.promptsDir, `${args.grokName}.md`)
  const rolePath = join(args.rolesDir, `${args.grokName}.toml`)
  const agentPath = join(args.agentsDir, `${args.grokName}.md`)
  const personaPath = join(args.personasDir, `${args.grokName}.toml`)
  await writeFile(promptPath, prompt, "utf8")
  await writeFile(rolePath, role.toml.replace(`${args.promptsDir}/${args.grokName}.md`, promptPath), "utf8")
  await writeFile(
    agentPath,
    renderAgentMarkdown(
      args.grokName,
      meta,
      args.sourceName,
      args.override,
      `omo/lazycodex components/ultrawork/agents/${args.sourceName}.toml`,
    ),
    "utf8",
  )
  await writeFile(personaPath, renderPersonaToml(meta, promptPath, args.override), "utf8")
  return [agentPath, rolePath, personaPath, promptPath]
}

async function writeMinimalAgentSurfaces(args: {
  readonly sourceName: string
  readonly grokName: string
  readonly override: NonNullable<ReturnType<typeof overrideForAgent>>
  readonly agentsDir: string
  readonly rolesDir: string
  readonly promptsDir: string
}): Promise<string[]> {
  const promptPath = join(args.promptsDir, `${args.grokName}.md`)
  const rolePath = join(args.rolesDir, `${args.grokName}.toml`)
  const agentPath = join(args.agentsDir, `${args.grokName}.md`)
  const prompt = nativeOmoFallbackPrompt(args.sourceName)
  const meta = {
    description: nativeAgentDescription(args.sourceName),
    instructions: prompt,
    model: args.override.model,
    reasoning: args.override.reasoningLevel,
  }
  await writeFile(promptPath, prompt, "utf8")
  await writeFile(rolePath, renderMinimalGrokRoleToml(args.grokName, args.override, promptPath), "utf8")
  await writeFile(agentPath, renderAgentMarkdown(args.grokName, meta, args.sourceName, args.override, "lfg-owned fallback prompt"), "utf8")
  return [agentPath, rolePath, promptPath]
}

function builtinGeneralPurposeEnhancementPrompt(): string {
  return [
    "You are GrokBuild's host-owned general-purpose subagent, enhanced with OMO execution discipline.",
    "Keep the native full-capability toolset. Complete the assigned slice directly; subagents cannot spawn nested subagents.",
    "Read applicable installed skills before acting, reuse repository conventions, keep scope tight, and preserve user work.",
    "Return concrete evidence: changed paths, observable behavior, focused verification, and any remaining blocker.",
  ].join("\n")
}

function builtinExploreEnhancementPrompt(): string {
  return [
    "You are GrokBuild's host-owned explore subagent, enhanced with OMO Explorer and OMP Scout discipline.",
    "Keep the native read-only tool contract. Investigate only the requested surface; never edit files.",
    "Search before reading, follow definitions and references when available, and report exact paths, symbols, contracts, and risks.",
    "Compress findings for handoff. Separate observed facts from inference and name any unanswered question.",
  ].join("\n")
}

function renderAgentMarkdown(
  grokName: string,
  meta: AgentMeta,
  sourceName: string,
  override: ReturnType<typeof overrideForAgent>,
  sourceLabel: string,
): string {
  const model = override?.model ?? meta.model
  const permission = nativeAgentPermissionMode(sourceName)
  // Prefer policy sourceName; also honor grokName for aliases.
  const policyName = isReadOnlyNativeAgent(sourceName) || isReadOnlyNativeAgent(grokName) ? sourceName : sourceName
  const policy = nativeAgentPermissionPolicyBlock(policyName)
  const body = meta.instructions.includes("<lfg-agent-permissions>")
    ? meta.instructions.trim()
    : `${meta.instructions.trim()}\n\n${policy}`
  return `---\nname: ${grokName}\ndescription: >\n  ${meta.description}\nprompt_mode: full\nmodel: ${renderYamlDoubleQuotedScalar(model)}\npermission_mode: ${permission}\nagents_md: true\n---\n\n<!-- Source: ${sourceLabel}; reasoning_effort=${override?.reasoningLevel ?? meta.reasoning}; permission=${permission} -->\n\n${body}\n`
}

function renderPersonaToml(meta: AgentMeta, promptPath: string, override: ReturnType<typeof overrideForAgent>): string {
  return [
    `description = ${JSON.stringify(meta.description)}`,
    `instructions_file = ${JSON.stringify(promptPath)}`,
    `model = ${JSON.stringify(override?.model ?? meta.model)}`,
    `reasoning_effort = ${JSON.stringify(override?.reasoningLevel ?? meta.reasoning)}`,
    `default_isolation = "none"`,
    "",
  ].join("\n")
}

type AgentMeta = {
  readonly description: string
  readonly instructions: string
  readonly model: string
  readonly reasoning: string
}

function parseCodexAgentMeta(text: string): AgentMeta {
  return {
    description: parseScalar(text, "description") ?? "LFG LazyCodex agent.",
    instructions: parseTriple(text, "developer_instructions") ?? "Complete the assigned task.\n",
    model: parseScalar(text, "model") ?? "inherit",
    reasoning: parseScalar(text, "model_reasoning_effort") ?? "medium",
  }
}

function parseScalar(text: string, key: string): string | null {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(text)
  return match?.[1] ?? null
}

function parseTriple(text: string, key: string): string | null {
  const match = new RegExp(`${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m").exec(text)
  return match?.[1]?.trim() ?? null
}

async function migrateLegacyLazycodexPrompts(home: string): Promise<void> {
  const promptsRoot = join(home, ".grok", "prompts")
  const legacyPromptsDir = join(promptsRoot, "lazycodex")
  const omoPromptsDir = join(promptsRoot, "omo")
  const entries = await readMarkdownEntries(legacyPromptsDir)
  if (entries === null) return

  await mkdir(omoPromptsDir, { recursive: true })
  for (const entry of entries) {
    const targetPath = join(omoPromptsDir, entry)
    if (!(await fileExists(targetPath))) {
      await writeFile(targetPath, await readFile(join(legacyPromptsDir, entry), "utf8"), "utf8")
    }
  }

  await rewriteLegacyPromptRefs(home, legacyPromptsDir, omoPromptsDir)
  await rm(legacyPromptsDir, { recursive: true, force: true })
}

async function rewriteLegacyPromptRefs(home: string, legacyPromptsDir: string, omoPromptsDir: string): Promise<void> {
  const rolesDir = join(home, ".grok", "roles")
  for (const entry of (await readTomlEntries(rolesDir)) ?? []) {
    const rolePath = join(rolesDir, entry)
    const text = await readFile(rolePath, "utf8")
    const nextText = text
      .replaceAll(legacyPromptsDir, omoPromptsDir)
      .replaceAll(".grok/prompts/lazycodex/", ".grok/prompts/omo/")
    if (nextText !== text) await writeFile(rolePath, nextText, "utf8")
  }
}

async function readMarkdownEntries(dir: string): Promise<string[] | null> {
  try {
    const entries = await readdir(dir)
    return entries.filter((entry) => entry.endsWith(".md")).sort()
  } catch {
    return null
  }
}

async function readTomlEntries(dir: string): Promise<string[] | null> {
  try {
    const entries = await readdir(dir)
    return entries.filter((entry) => entry.endsWith(".toml")).sort()
  } catch {
    return null
  }
}

async function moveConflictingUserAgentsAside(home: string, names: readonly string[]): Promise<void> {
  await moveConflictingMarkdownAgentsAside(home, names)
  const userAgentsDir = join(home, ".grok", "agents")
  const tomlBackupDir = join(home, ".grok", "agents-toml-backup-lfg")
  await mkdir(tomlBackupDir, { recursive: true })
  for (const entry of (await readTomlEntries(userAgentsDir)) ?? []) await moveIfExists(join(userAgentsDir, entry), join(tomlBackupDir, basename(entry)))
}

function conflictingUserAgentNames(): string[] {
  return Object.values(GROK_AGENT_NAMES).filter((name) => !GROK_BUILTIN_AGENT_NAMES.includes(name as (typeof GROK_BUILTIN_AGENT_NAMES)[number]))
}

async function removeBuiltinShadowAgents(agentsDir: string): Promise<void> {
  for (const name of RETIRED_SHADOW_AGENT_NAMES) await removeIfExists(join(agentsDir, `${name}.md`))
}

async function removeRetiredGrokAgentSurfaces(dirs: {
  readonly agentsDir: string
  readonly rolesDir: string
  readonly personasDir: string
  readonly promptsDir: string
}): Promise<void> {
  for (const name of RETIRED_GROK_AGENT_NAMES) {
    await removeIfExists(join(dirs.agentsDir, `${name}.md`))
    await removeIfExists(join(dirs.rolesDir, `${name}.toml`))
    await removeIfExists(join(dirs.personasDir, `${name}.toml`))
    await removeIfExists(join(dirs.promptsDir, `${name}.md`))
  }
}

async function moveConflictingMarkdownAgentsAside(home: string, names: readonly string[]): Promise<void> {
  const userAgentsDir = join(home, ".grok", "agents")
  const mdBackupDir = join(home, ".grok", "agents-user-backup-lfg")
  await mkdir(mdBackupDir, { recursive: true })
  for (const name of names) await moveIfExists(join(userAgentsDir, `${name}.md`), join(mdBackupDir, `${name}.md`))
}

async function moveIfExists(source: string, dest: string): Promise<void> {
  try {
    const text = await readFile(source, "utf8")
    if (!(await fileExists(dest))) await writeFile(dest, text, "utf8")
    await unlink(source)
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error
  }
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8")
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
