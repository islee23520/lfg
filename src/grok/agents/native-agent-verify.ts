import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NATIVE_HEPHAESTUS_MARKER, NATIVE_OMO_AGENT_NAMES, NATIVE_SISYPHUS_MARKER } from "./native-omo-agents"

export type NativeAgentsVerifyResult = {
  readonly status: "verified" | "missing"
  readonly pluginAgents: readonly string[]
  readonly roles: readonly string[]
  readonly prompts: readonly string[]
  readonly sisyphusDefaultAgent: boolean
  readonly hephaestusPromptPresent: boolean
}

export async function verifyNativeOmoAgents(pluginRoot: string, home: string): Promise<NativeAgentsVerifyResult> {
  const pluginAgents = await existingNames(pluginRoot, "agents", ".md")
  const roles = await existingNames(join(home, ".grok"), "roles", ".toml")
  const prompts = await existingNames(join(home, ".grok", "prompts"), "omo", ".md")
  const defaultAgent = await readSafe(join(pluginRoot, "agents", "default.md"))
  const defaultPrompt = await readSafe(join(home, ".grok", "prompts", "omo", "default.md"))
  const hephaestusAgent = await readSafe(join(pluginRoot, "agents", "hephaestus.md"))
  const hephaestusPrompt = await readSafe(join(home, ".grok", "prompts", "omo", "hephaestus.md"))
  const sisyphusDefaultAgent = defaultAgent.includes(NATIVE_SISYPHUS_MARKER) && defaultPrompt.includes(NATIVE_SISYPHUS_MARKER)
  const hephaestusPromptPresent = hephaestusAgent.includes(NATIVE_HEPHAESTUS_MARKER) && hephaestusPrompt.includes(NATIVE_HEPHAESTUS_MARKER)
  const allNativeAgentsPresent =
    NATIVE_OMO_AGENT_NAMES.every((name) => pluginAgents.includes(name)) &&
    NATIVE_OMO_AGENT_NAMES.every((name) => roles.includes(name)) &&
    NATIVE_OMO_AGENT_NAMES.every((name) => prompts.includes(name))
  const status = sisyphusDefaultAgent && hephaestusPromptPresent && allNativeAgentsPresent ? "verified" : "missing"
  return { status, pluginAgents, roles, prompts, sisyphusDefaultAgent, hephaestusPromptPresent }
}

async function existingNames(root: string, dir: string, ext: string): Promise<readonly string[]> {
  const names: string[] = []
  for (const name of NATIVE_OMO_AGENT_NAMES) {
    const path = join(root, dir, `${name}${ext}`)
    if ((await readSafe(path)).length > 0) names.push(name)
  }
  return names
}

async function readSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (error instanceof Error) {
      return ""
    }
    throw error
  }
}

