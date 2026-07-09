import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  lazycodexAgentOverridesPath,
  omoAgentOverridesPath,
  type LazycodexAgentOverrideMap,
} from "./lazycodex-agent-overrides"

export type UserModelOverrideOptions = {
  readonly home: string
}

type StoredOverridesFile = {
  readonly version?: number
  readonly overrides?: Readonly<Record<string, unknown>>
}

export function getCanonicalUserOverridePath(home: string): string {
  return omoAgentOverridesPath(home)
}

export function getLegacyUserOverridePath(home: string): string {
  return lazycodexAgentOverridesPath(home)
}

export function readStoredUserOverrideFile(path: string): StoredOverridesFile | null {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as StoredOverridesFile
    if (!parsed || typeof parsed !== "object") return null
    return parsed
  } catch {
    return null
  }
}

export function migrateLegacyUserOverrideConfig(options: UserModelOverrideOptions): string | null {
  const home = options.home
  const canonicalPath = getCanonicalUserOverridePath(home)
  const legacyPath = getLegacyUserOverridePath(home)
  const canonical = readStoredUserOverrideFile(canonicalPath)
  if (canonical?.overrides && Object.keys(canonical.overrides).length > 0) {
    return canonicalPath
  }
  const legacy = readStoredUserOverrideFile(legacyPath)
  if (!legacy?.overrides || Object.keys(legacy.overrides).length === 0) {
    return canonical ? canonicalPath : null
  }
  mkdirSync(dirname(canonicalPath), { recursive: true })
  const body = {
    version: typeof legacy.version === "number" ? legacy.version : 1,
    overrides: legacy.overrides,
  }
  writeFileSync(canonicalPath, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  return canonicalPath
}

export function saveUserOverrideConfig(
  home: string,
  overrides: LazycodexAgentOverrideMap | StoredOverridesFile["overrides"],
): string {
  const path = getCanonicalUserOverridePath(home)
  mkdirSync(join(home, ".grok"), { recursive: true })
  const body =
    overrides && typeof overrides === "object" && "overrides" in (overrides as object)
      ? overrides
      : { version: 1, overrides }
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  return path
}

export function restoreSavedUserOverrideConfigIfPresent(
  targetPath: string,
  savedUserConfigPath: string,
): boolean {
  if (!existsSync(savedUserConfigPath)) return false
  const saved = readStoredUserOverrideFile(savedUserConfigPath)
  if (!saved) return false
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, `${JSON.stringify(saved, null, 2)}\n`, "utf8")
  return true
}

export function createRestoredUserOverrideConfig(
  home: string,
  savedUserConfigPath: string,
): string | null {
  const target = getCanonicalUserOverridePath(home)
  const restored = restoreSavedUserOverrideConfigIfPresent(target, savedUserConfigPath)
  return restored ? target : null
}
