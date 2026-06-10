import { access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ASSET_DIR = "flavour-pack-assets"

/** Directory containing vendored lazycodex-flavour-pack agent TOMLs (Grok port, not full LFP package). */
export async function resolveFlavourPackAssetsRoot(moduleUrl: string = import.meta.url): Promise<string> {
  const here = dirname(toFilePath(moduleUrl))
  const candidates = [
    join(here, "grok-install", ASSET_DIR),
    join(here, ASSET_DIR),
    join(here, "..", "grok-install", ASSET_DIR),
    join(here, "..", "..", "grok-install", ASSET_DIR),
  ]
  for (const path of candidates) {
    if (await pathExists(path)) {
      return path
    }
  }
  throw new Error(`flavour-pack assets not found (searched from ${here})`)
}

function toFilePath(moduleUrl: string): string {
  if (moduleUrl.startsWith("file://")) {
    return fileURLToPath(moduleUrl)
  }
  return moduleUrl
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}