import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import type { LazycodexAgentOverrideMap } from "./lazycodex-agent-overrides"
import { overrideForAgent } from "./lazycodex-agent-overrides"
import { renderGrokRoleTomlFromCodex, renderMinimalGrokRoleToml } from "./codex-agent-toml-to-grok"
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset"

const ULTRAWORK_AGENTS_DIR = join("components", "ultrawork", "agents")
const EXTRA_WORKER_AGENTS = ["reasoning", "coding"] as const

const GROK_AGENT_NAMES: Readonly<Record<string, string>> = {
  plan: "plan",
  explorer: "explorer",
  librarian: "librarian",
  metis: "metis",
  momus: "momus",
  "codex-ultrawork-reviewer": "reviewer",
  reasoning: "reasoning",
  coding: "coding",
}

const READ_ONLY_AGENT_NAMES = new Set(["plan", "explorer", "librarian", "metis", "momus", "codex-ultrawork-reviewer"])

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
  const entries = await readTomlEntries(sourceDir)
  if (entries === null) return null

  const agentsDir = join(resolved.pluginRoot, "agents")
  const rolesDir = join(home, ".grok", "roles")
  const personasDir = join(home, ".grok", "personas")
  const promptsDir = join(home, ".grok", "prompts", "lazycodex")
  await mkdir(agentsDir, { recursive: true })
  await mkdir(rolesDir, { recursive: true })
  await mkdir(personasDir, { recursive: true })
  await mkdir(promptsDir, { recursive: true })
  await moveConflictingUserAgentsAside(home, [...Object.values(GROK_AGENT_NAMES)])

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

  for (const sourceName of EXTRA_WORKER_AGENTS) {
    if (syncedNames.has(sourceName)) continue
    const override = overrideForAgent(agentOverrides, sourceName)
    if (override === undefined) continue
    const grokName = GROK_AGENT_NAMES[sourceName]
    written.push(...(await writeWorkerAgentSurfaces({ sourceName, grokName, override, agentsDir, rolesDir, promptsDir })))
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
  }

  // Bundle (LFG-shadowed Grok builtin) agents are intentionally disabled.
  // Real agents (ulw, ultraresearch, feasible-goal, etc.) come from the lazycodex plugin tree
  // (components/ultrawork/agents) and LFP-style overrides, so Grok builtins remain available
  // unless the upstream lazycodex tree itself provides same-named agents.

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
  await writeFile(agentPath, renderAgentMarkdown(args.grokName, meta, args.sourceName, args.override), "utf8")
  await writeFile(personaPath, renderPersonaToml(meta, promptPath, args.override), "utf8")
  return [agentPath, rolePath, personaPath, promptPath]
}

async function writeWorkerAgentSurfaces(args: {
  readonly sourceName: "reasoning" | "coding"
  readonly grokName: string
  readonly override: NonNullable<ReturnType<typeof overrideForAgent>>
  readonly agentsDir: string
  readonly rolesDir: string
  readonly promptsDir: string
}): Promise<string[]> {
  const promptPath = join(args.promptsDir, `${args.grokName}.md`)
  const rolePath = join(args.rolesDir, `${args.grokName}.toml`)
  const agentPath = join(args.agentsDir, `${args.grokName}.md`)
  const prompt = `You are the LFG LazyCodex ${args.sourceName} worker. Complete the assigned task directly, keep scope tight, and verify before final response.\n`
  const meta = {
    description: `LFG LazyCodex ${args.sourceName} worker.`,
    instructions: prompt,
    model: args.override.model,
    reasoning: args.override.reasoningLevel,
  }
  await writeFile(promptPath, prompt, "utf8")
  await writeFile(rolePath, renderMinimalGrokRoleToml(args.grokName, args.override), "utf8")
  await writeFile(agentPath, renderAgentMarkdown(args.grokName, meta, args.sourceName, args.override), "utf8")
  return [agentPath, rolePath, promptPath]
}

function renderAgentMarkdown(
  grokName: string,
  meta: AgentMeta,
  sourceName: string,
  override: ReturnType<typeof overrideForAgent>,
): string {
  const model = override?.model ?? meta.model
  const permission = READ_ONLY_AGENT_NAMES.has(sourceName) ? "plan" : "default"
  return `---\nname: ${grokName}\ndescription: >\n  ${meta.description}\nprompt_mode: full\nmodel: ${model}\npermission_mode: ${permission}\nagents_md: true\n---\n\n<!-- Source: omo/lazycodex components/ultrawork/agents/${sourceName}.toml; reasoning_effort=${override?.reasoningLevel ?? meta.reasoning} -->\n\n${meta.instructions.trim()}\n`
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
