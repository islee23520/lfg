import { access } from "node:fs/promises"
import { join } from "node:path"
import type { JsonObject } from "../cli/lfg-json"

export type ProjectLocalGrokOptions = {
  readonly projectRoot: string
}

/**
 * Inspect project-local `.grok` (Grok Build per-repo config). Non-destructive; repair is manual until Grok documents automation.
 */
export async function inspectProjectLocalGrok(options: ProjectLocalGrokOptions): Promise<JsonObject> {
  const localDir = join(options.projectRoot, ".grok")
  const configPath = join(localDir, "config.toml")
  const exists = await pathExists(localDir)
  const configExists = await pathExists(configPath)
  return {
    ok: true,
    status: exists ? "present" : "absent",
    projectRoot: options.projectRoot,
    localGrokDir: localDir,
    configPath,
    configExists,
    repair: "N/A — use `lfg setup --run` for user HOME; merge project .grok manually per Grok user guide",
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}