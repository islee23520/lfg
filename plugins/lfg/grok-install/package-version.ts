import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { packageJsonHasBinLfg } from "../bin/npm-publish-bin"

/** Read `@islee23520/lfg` version from published workspace root (npm pack layout). */
export async function readLfgPackageVersionFromBundle(moduleUrl: string): Promise<string | null> {
  const distDir = dirname(fileURLToPath(moduleUrl))
  const candidates = [
    join(distDir, "..", "..", "..", "package.json"),
    join(distDir, "..", "..", "package.json"),
    join(distDir, "..", "package.json"),
  ]
  for (let i = 0; i < candidates.length; i++) {
    const path = candidates[i]!
    const requirePublishBin = i === 0
    const version = await readVersionField(path, requirePublishBin)
    if (version !== null) {
      return version
    }
  }
  return null
}

async function readVersionField(packageJsonPath: string, requireBinLfg: boolean): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown
    if (typeof parsed !== "object" || parsed === null) {
      return null
    }
    const record = parsed as Record<string, unknown>
    const version = record.version
    if (typeof version !== "string" || version.length === 0) {
      return null
    }
    if (requireBinLfg && !(await packageJsonHasBinLfg(packageJsonPath))) {
      return null
    }
    return version
  } catch {
    return null
  }
}