import { access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export type OmoPayloadSource = {
  readonly sourcePath: string
  readonly payloadDescription: string
}

export async function resolveOmoPayloadSource(env: NodeJS.ProcessEnv = process.env): Promise<OmoPayloadSource | null> {
  const explicit = env.LFG_OMO_PLUGIN_SOURCE?.trim()
  if (explicit) {
    return (await isBundledOmoPayload(explicit))
      ? { sourcePath: explicit, payloadDescription: "LFG_OMO_PLUGIN_SOURCE" }
      : null
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "grok-install"),
    join(here, "..", "grok-install"),
    join(here, "..", "..", "dist", "grok-install"),
  ]
  for (const sourcePath of candidates) {
    if (await isBundledOmoPayload(sourcePath)) {
      return { sourcePath, payloadDescription: "bundled dist/grok-install" }
    }
  }
  return null
}

async function isBundledOmoPayload(root: string): Promise<boolean> {
  try {
    await access(join(root, "assets", "lfg-grok-hook-bridge.mjs"))
    await access(join(root, "assets", "lfg-config-loader.mjs"))
    await access(join(root, "hooks", "hooks.json"))
    await access(join(root, "fixture-minimal", "hooks", "hooks.json"))
    return true
  } catch {
    return false
  }
}
