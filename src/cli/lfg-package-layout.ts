import { access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { packageJsonHasBinLfg } from "./npm-publish-bin"

export type LfgCliLayout = {
  readonly ok: boolean
  readonly distEntry: string
  readonly packageRoot: string | null
  readonly layout: "published-workspace" | "workspace-dev" | "unknown"
}

/** Resolve CLI layout from the running bundle (dist/lfg.js) or dev entry. */
export async function resolveLfgCliLayout(moduleUrl: string): Promise<LfgCliLayout> {
  const distEntry = fileURLToPath(moduleUrl)
  const distDir = dirname(distEntry)
  const basename = distEntry.split(/[/\\]/).pop() ?? ""

  if (basename === "lfg.ts" || distDir.endsWith("/src/cli") || distDir.endsWith("\\src\\cli")) {
    const packageRoot = join(distDir, "..", "..")
    const devDist = join(packageRoot, "dist", "lfg.js")
    const devOk = await pathExists(devDist)
    return {
      ok: devOk,
      distEntry: devOk ? devDist : distEntry,
      packageRoot: devOk ? packageRoot : null,
      layout: "workspace-dev",
    }
  }

  const packageRoot = join(distDir, "..")
  const publishedPkgJson = join(packageRoot, "package.json")

  if (await pathExists(publishedPkgJson)) {
    const hasPublishBin = await packageJsonHasBinLfg(publishedPkgJson)
    const distOk = await pathExists(distEntry)
    if (hasPublishBin && distOk) {
      return {
        ok: true,
        distEntry,
        packageRoot,
        layout: "published-workspace",
      }
    }
    if (!hasPublishBin) {
      return { ok: false, distEntry, packageRoot, layout: "unknown" }
    }
    return { ok: false, distEntry, packageRoot, layout: "published-workspace" }
  }

  return { ok: await pathExists(distEntry), distEntry, packageRoot: null, layout: "unknown" }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

