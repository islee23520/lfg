import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import type { LazycodexAgentOverrideMap } from "./lazycodex-agent-overrides"
import { overrideForAgent } from "./lazycodex-agent-overrides"
import { renderGrokRoleTomlFromCodex, renderMinimalGrokRoleToml } from "./codex-agent-toml-to-grok"
import { nativeOmoFallbackPrompt } from "./native-omo-agents"
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { renderYamlDoubleQuotedScalar } from "./model-id-safety"
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset"

const ULTRAWORK_AGENTS_DIR = join("components", "ultrawork", "agents")

/**
 * Maps codex component/ultrawork agent TOML names to Grok agent names.
 * Agents without a codex TOML (default, sisyphus, hephaestus, prometheus,
 * atlas, oracle, multimodal-looker, sisyphus-junior) receive Grok-native
 * fallback prompts from nativeOmoFallbackPrompt(), adapted from the
 * upstream OMO opencode agent tree.
 */
const GROK_AGENT_NAMES: Readonly<Record<string, string>> = {
  default: "default",
  sisyphus: "sisyphus",
  hephaestus: "hephaestus",
  prometheus: "prometheus",
  atlas: "atlas",
  oracle: "oracle",
  "multimodal-looker": "multimodal-looker",
  "sisyphus-junior": "sisyphus-junior",
  plan: "plan",
  explorer: "explorer",
  librarian: "librarian",
  metis: "metis",
  momus: "momus",
  "codex-ultrawork-reviewer": "reviewer",
  reasoning: "reasoning",
  coding: "coding",
}

const READ_ONLY_AGENT_NAMES = new Set([
  "sisyphus",
  "atlas",
  "oracle",
  "plan",
  "explorer",
  "librarian",
  "metis",
  "momus",
  "codex-ultrawork-reviewer",
])

export type SyncLazycodexAgentsResult = {
  readonly ok: true
  readonly agentsDir: string
  readonly rolesDir: string
  readonly personasDir: string
  readonly promptsDir: string
  readonly written: readonly string[]
  readonly sourcePluginRoot: string
}

/** Install omo/lazycodex definitions as plugin-owned Grok agents plus documented roles/personas. */
export async function syncLazycodexAgentsToGrokLedger(
  home: string,
  agentOverrides: LazycodexAgentOverrideMap,
): Promise<SyncLazycodexAgentsResult | null> {
  const resolved = await resolveGrokAdapterPluginRoot(home)
  if (resolved === null) return null

  const sourceDir = join(resolved.pluginRoot, ULTRAWORK_AGENTS_DIR)
  const entries = (await readTomlEntries(sourceDir)) ?? []

  const agentsDir = join(resolved.pluginRoot, "agents")
  const rolesDir = join(home, ".grok", "roles")
  const personasDir = join(home, ".grok", "personas")
  const promptsDir = join(home, ".grok", "prompts", "omo")
  await mkdir(agentsDir, { recursive: true })
  await mkdir(rolesDir, { recursive: true })
  await mkdir(personasDir, { recursive: true })
  await mkdir(promptsDir, { recursive: true })
  await moveConflictingUserAgentsAside(home, conflictingUserAgentNames())

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
  const flavourEntries = await readTomlEntries(join(flavourRoot, "agent-configs"))
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
    const override = overrideForAgent(agentOverrides, sourceName)
    if (override === undefined) continue
    written.push(...(await writeMinimalAgentSurfaces({ sourceName, grokName, override, agentsDir, rolesDir, promptsDir })))
  }

  // Agents adapted from the OMO opencode tree (default/sisyphus, hephaestus, prometheus, atlas, oracle,
  // multimodal-looker, sisyphus-junior) use Grok-native fallback prompts.
  // Codex-origin agents (explorer, librarian, metis, momus, plan, reviewer) use TOML definitions
  // from components/ultrawork/agents. Grok builtins remain available unless overridden.

  return { ok: true, agentsDir, rolesDir, personasDir, promptsDir, written, sourcePluginRoot: resolved.pluginRoot }
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
    description: `LFG LazyCodex ${args.sourceName} agent.`,
    instructions: prompt,
    model: args.override.model,
    reasoning: args.override.reasoningLevel,
  }
  await writeFile(promptPath, prompt, "utf8")
  await writeFile(rolePath, renderMinimalGrokRoleToml(args.grokName, args.override), "utf8")
  await writeFile(agentPath, renderAgentMarkdown(args.grokName, meta, args.sourceName, args.override, "lfg-owned fallback prompt"), "utf8")
  return [agentPath, rolePath, promptPath]
}

function renderAgentMarkdown(
  grokName: string,
  meta: AgentMeta,
  sourceName: string,
  override: ReturnType<typeof overrideForAgent>,
  sourceLabel: string,
): string {
  const model = override?.model ?? meta.model
  const permission = READ_ONLY_AGENT_NAMES.has(sourceName) ? "plan" : "default"
  return `---\nname: ${grokName}\ndescription: >\n  ${meta.description}\nprompt_mode: full\nmodel: ${renderYamlDoubleQuotedScalar(model)}\npermission_mode: ${permission}\nagents_md: true\n---\n\n<!-- Source: ${sourceLabel}; reasoning_effort=${override?.reasoningLevel ?? meta.reasoning} -->\n\n${meta.instructions.trim()}\n`
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
  return [...Object.values(GROK_AGENT_NAMES)]
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
