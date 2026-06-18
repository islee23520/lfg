import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  CONFIGURABLE_LAZYCODEX_AGENT_NAMES,
  type LazycodexAgentModelOverride,
  type LazycodexAgentOverrideMap,
  readLazycodexAgentOverridesFile,
} from "./lazycodex-agent-overrides"

export const OMO_AGENT_OVERRIDES_FILENAME = "omo-agent-overrides.json"
export const CONFIGURABLE_OMO_AGENT_NAMES = CONFIGURABLE_LAZYCODEX_AGENT_NAMES

export type OmoAgentOverrideMap = LazycodexAgentOverrideMap
export type OmoAgentModelOverride = LazycodexAgentModelOverride

export function omoAgentOverridesPath(home: string): string {
  return join(home, ".grok", OMO_AGENT_OVERRIDES_FILENAME)
}

export async function readOmoAgentOverridesFile(home: string): Promise<OmoAgentOverrideMap> {
  try {
    const raw = await readFile(omoAgentOverridesPath(home), "utf8")
    return JSON.parse(raw) as OmoAgentOverrideMap
  } catch {
    return readLazycodexAgentOverridesFile(home)
  }
}
