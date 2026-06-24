import { readFile } from "node:fs/promises"

export const PUBLISHED_LFG_BIN_TARGET = "bin/lfg.js"

/** npm pack root layout: bin.lfg must point at the root shell shim (#22). */
export function isPublishedLfgBinTarget(binLfg: string | undefined | null): boolean {
  return binLfg === PUBLISHED_LFG_BIN_TARGET
}

/** Whether package.json exposes npm bin.lfg (publish-root layout #22). */
export async function packageJsonHasBinLfg(packageJsonPath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown
    if (typeof parsed !== "object" || parsed === null) {
      return false
    }
    const bin = (parsed as Record<string, unknown>).bin
    if (typeof bin !== "object" || bin === null) {
      return false
    }
    const lfg = (bin as Record<string, unknown>).lfg
    return typeof lfg === "string" && isPublishedLfgBinTarget(lfg)
  } catch {
    return false
  }
}