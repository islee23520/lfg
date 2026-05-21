import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { SmokePaths } from "./types"

export function smokePaths(): SmokePaths {
  const smokeDir = dirname(fileURLToPath(import.meta.url))
  const pluginRoot = resolve(smokeDir, "../..")
  return {
    pluginRoot,
    repoRoot: resolve(pluginRoot, "../.."),
  }
}
