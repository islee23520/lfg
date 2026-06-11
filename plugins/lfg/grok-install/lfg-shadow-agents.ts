import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAgentOverrideMap } from "./lazycodex-agent-overrides"

export const LFG_SHADOW_AGENT_NAMES = ["general-purpose", "explore", "grok-build", "builder", "ulw"] as const

export async function writeLfgShadowAgents(home: string, agentOverrides: LazycodexAgentOverrideMap): Promise<readonly string[]> {
  const shadowAgentsDir = join(home, ".grok", "agents")
  await mkdir(shadowAgentsDir, { recursive: true })
  await moveConflictingMarkdownAgentsAside(home, LFG_SHADOW_AGENT_NAMES)
  return writeShadowAgentSurfaces(shadowAgentsDir, agentOverrides)
}

async function writeShadowAgentSurfaces(shadowAgentsDir: string, agentOverrides: LazycodexAgentOverrideMap): Promise<string[]> {
  const explorerModel = agentOverrides.explorer.model
  const reasoningModel = agentOverrides.reasoning.model
  const codingModel = agentOverrides.coding.model
  const definitions = [
    {
      name: "general-purpose",
      description:
        "LFG LazyCodex general-purpose agent replacing the Grok built-in. High-reasoning default worker for broad research and execution tasks.",
      model: reasoningModel,
      permission: "default",
      body: "Complete the assigned task directly. Use LFG/LazyCodex reasoning defaults. Do what was asked; nothing more, nothing less.",
    },
    {
      name: "explore",
      description:
        "LFG LazyCodex codebase exploration agent replacing the Grok built-in. Finds files, symbols, code paths, and local implementation evidence. Read-only.",
      model: explorerModel,
      permission: "plan",
      body: "Role: codebase search specialist. Find files, symbols, code paths, and local implementation evidence. Return concise actionable results. Read-only.",
    },
    {
      name: "grok-build",
      description:
        "LFG LazyCodex builder agent replacing the Grok built-in. Implements scoped code changes, coordinates LFG workers, and verifies before final response.",
      model: codingModel,
      permission: "default",
      body: renderUlwBody("grok-build"),
    },
    {
      name: "builder",
      description:
        "LFG LazyCodex builder alias. Implements scoped code changes, coordinates LFG workers, and verifies before final response.",
      model: codingModel,
      permission: "default",
      body: renderUlwBody("builder"),
    },
    {
      name: "ulw",
      description:
        "LFG LazyCodex ULW default orchestrator, analogous to OMO/LazyCodex Sisyphus. Decomposes work, delegates to LFG workers, and closes the loop with evidence.",
      model: reasoningModel,
      permission: "default",
      body: renderUlwBody("ulw"),
    },
  ] as const
  const written: string[] = []
  for (const definition of definitions) {
    const path = join(shadowAgentsDir, `${definition.name}.md`)
    await writeFile(path, renderShadowAgentMarkdown(definition), "utf8")
    written.push(path)
  }
  return written
}

function renderShadowAgentMarkdown(definition: {
  readonly name: string
  readonly description: string
  readonly model: string
  readonly permission: string
  readonly body: string
}): string {
  return `---\nname: ${definition.name}\ndescription: >\n  ${definition.description}\nprompt_mode: full\nmodel: ${definition.model}\npermission_mode: ${definition.permission}\nagents_md: true\n---\n\n${definition.body.trim()}\n`
}

function renderUlwBody(name: string): string {
  return `You are ${name}, the LFG LazyCodex ultrawork default orchestrator.\n\nOperate like OMO/LazyCodex Sisyphus: keep one concrete goal in focus, decompose only as much as needed, use the LFG explorer/reasoning/coding/reviewer workers when delegation helps, preserve user changes, and verify the result before reporting completion. Prefer direct execution over ceremony. Do not add scope beyond the user's request.`
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
    await writeFile(dest, text, "utf8")
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
