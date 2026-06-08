import { isPublishedLfgBinTarget } from "./npm-publish-bin"

/** Values seen on broken registry publishes (#22). */
export const LEGACY_REGISTRY_BIN_LFG_TARGETS = [
  "plugins/lfg/dist/lfg.js",
  "dist/lfg.js",
] as const

/** Parse `npm view <pkg> bin.lfg` stdout (#22). */
export function parseNpmRegistryBinLfg(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
    return null
  }
  return trimmed
}

export function isLegacyRegistryBinLfg(binLfg: string | undefined | null): boolean {
  if (binLfg === undefined || binLfg === null || binLfg === "") {
    return false
  }
  return (LEGACY_REGISTRY_BIN_LFG_TARGETS as readonly string[]).includes(binLfg)
}

export function registryBinPublishContract(binLfg: string | null): {
  readonly binLfg: string | null
  readonly matchesPublishContract: boolean
  readonly legacyWrongTarget: boolean
} {
  return {
    binLfg,
    matchesPublishContract: binLfg !== null && isPublishedLfgBinTarget(binLfg),
    legacyWrongTarget: isLegacyRegistryBinLfg(binLfg),
  }
}