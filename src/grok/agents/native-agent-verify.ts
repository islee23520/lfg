import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { BUILTIN_OVERLAY_AGENT_NAMES, NATIVE_DEFAULT_AGENT_MARKER, NATIVE_OMO_AGENT_NAMES } from "./native-omo-agents"

export type NativeAgentsVerifyResult = {
  readonly status: "verified" | "missing"
  readonly pluginAgents: readonly string[]
  readonly roles: readonly string[]
  readonly prompts: readonly string[]
  readonly watcherDefaultAgent: boolean
  readonly retiredLazycodexAbsent: boolean
}

export async function verifyNativeOmoAgents(pluginRoot: string, home: string): Promise<NativeAgentsVerifyResult> {
  const pluginAgents = await existingNames(pluginRoot, "agents", ".md")
  const roles = await existingNames(join(home, ".grok"), "roles", ".toml")
  const prompts = await existingNames(join(home, ".grok", "prompts"), "omo", ".md")
  const builtinPrompts = await existingBuiltinOverlayNames(join(home, ".grok", "prompts"), "omo", ".md")
  const defaultAgent = await readSafe(join(pluginRoot, "agents", "sisyphus.md"))
  const defaultPrompt = await readSafe(join(home, ".grok", "prompts", "omo", "sisyphus.md"))
  const watcherDefaultAgent =
    defaultAgent.includes(NATIVE_DEFAULT_AGENT_MARKER) && defaultPrompt.includes(NATIVE_DEFAULT_AGENT_MARKER)
  const retiredLazycodexAbsent =
    (await readSafe(join(pluginRoot, "agents", "lazycodex.md"))).length === 0 &&
    (await readSafe(join(home, ".grok", "prompts", "omo", "lazycodex.md"))).length === 0
  const allNativeAgentsPresent =
    NATIVE_OMO_AGENT_NAMES.every((name) => BUILTIN_OVERLAY_AGENT_NAMES.has(name) || pluginAgents.includes(name)) &&
    NATIVE_OMO_AGENT_NAMES.every((name) => roles.includes(name)) &&
    NATIVE_OMO_AGENT_NAMES.every(
      (name) => prompts.includes(name) || (BUILTIN_OVERLAY_AGENT_NAMES.has(name) && builtinPrompts.includes(name)),
    )
  const status = watcherDefaultAgent && retiredLazycodexAbsent && allNativeAgentsPresent ? "verified" : "missing"
  return { status, pluginAgents, roles, prompts, watcherDefaultAgent, retiredLazycodexAbsent }
}

async function existingNames(root: string, dir: string, ext: string): Promise<readonly string[]> {
  const names: string[] = []
  for (const name of NATIVE_OMO_AGENT_NAMES) {
    const path = join(root, dir, `${name}${ext}`)
    if ((await readSafe(path)).length > 0) names.push(name)
  }
  return names
}

async function existingBuiltinOverlayNames(root: string, dir: string, ext: string): Promise<readonly string[]> {
  const names: string[] = []
  for (const name of BUILTIN_OVERLAY_AGENT_NAMES) {
    const path = join(root, dir, `builtin-${name}${ext}`)
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
