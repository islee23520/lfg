import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** Read `@islee23520/lfg` version from published workspace root (npm pack layout). */
export async function readLfgPackageVersionFromBundle(moduleUrl: string): Promise<string | null> {
  const distDir = dirname(fileURLToPath(moduleUrl))
  const candidates = [
    join(distDir, "..", "..", "..", "package.json"),
    join(distDir, "..", "..", "package.json"),
    join(distDir, "..", "package.json"),
  ]
  for (const path of candidates) {
    const version = await readVersionField(path)
    if (version !== null) {
      return version
    }
  }
  return null
}

async function readVersionField(packageJsonPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown
    if (typeof parsed !== "object" || parsed === null) {
      return null
    }
    const version = (parsed as Record<string, unknown>).version
    return typeof version === "string" && version.length > 0 ? version : null
  } catch {
    return null
  }
}