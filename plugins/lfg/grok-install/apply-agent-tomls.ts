import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAgentConfig } from "../bin/lfg-models"
import { mergeAgentTomlOverrides } from "./agent-overrides"

const AGENT_NAMES = ["explorer", "reasoning", "coding"] as const

export type ApplyAgentTomlsResult = {
  readonly ok: true
  readonly agentsDir: string
  readonly written: readonly string[]
}

/** Write ~/.grok/agents/<name>.toml from lazycodex agent config (idempotent merge). */
export async function applyLazycodexAgentTomls(home: string, agentConfig: LazycodexAgentConfig): Promise<ApplyAgentTomlsResult> {
  const agentsDir = join(home, ".grok", "agents")
  await mkdir(agentsDir, { recursive: true })
  const written: string[] = []
  for (const name of AGENT_NAMES) {
    const setting = agentConfig[name]
    const path = join(agentsDir, `${name}.toml`)
    const body = mergeAgentTomlOverrides("", {
      model: setting.model,
      reasoningLevel: setting.reasoningLevel,
    })
    await writeFile(path, body, "utf8")
    written.push(path)
  }
  return { ok: true, agentsDir, written }
}