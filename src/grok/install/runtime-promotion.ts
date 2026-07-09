import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import { join } from "node:path"

export type RuntimeEntry = string | { readonly path: string; readonly optional?: boolean }

export type NormalizedRuntimeEntry = {
  readonly path: string
  readonly optional: boolean
}

export type RuntimePromotion = {
  readonly tempRoot: string
  readonly pluginRoot: string
  readonly backupRoot: string
  committed: boolean
}

export function normalizeRuntimeEntry(entry: RuntimeEntry): NormalizedRuntimeEntry {
  if (typeof entry === "string") return { path: entry, optional: false }
  return { path: entry.path, optional: entry.optional === true }
}

export function prepareRuntimePromotion(
  packageRoot: string,
  pluginRoot: string,
  entries: readonly RuntimeEntry[],
): RuntimePromotion {
  const suffix = `${process.pid}-${Date.now()}`
  const tempRoot = `${pluginRoot}.tmp-${suffix}`
  const backupRoot = `${pluginRoot}.bak-${suffix}`
  rmSync(tempRoot, { recursive: true, force: true })
  rmSync(backupRoot, { recursive: true, force: true })
  mkdirSync(tempRoot, { recursive: true })

  try {
    let copied = 0
    for (const entry of entries) {
      const item = normalizeRuntimeEntry(entry)
      const source = join(packageRoot, item.path)
      if (item.optional && !existsSync(source)) continue
      cpSync(source, join(tempRoot, item.path), { recursive: true })
      copied += 1
    }
    if (copied === 0) {
      throw new Error(`No runtime entries found under ${packageRoot}`)
    }
    return { tempRoot, pluginRoot, backupRoot, committed: false }
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true })
    throw error
  }
}

export function commitRuntimePromotion(promotion: RuntimePromotion): void {
    if (existsSync(promotion.pluginRoot)) renameSync(promotion.pluginRoot, promotion.backupRoot)
  try {
    renameSync(promotion.tempRoot, promotion.pluginRoot)
    promotion.committed = true
  } catch (error) {
    if (existsSync(promotion.backupRoot) && !existsSync(promotion.pluginRoot)) {
      renameSync(promotion.backupRoot, promotion.pluginRoot)
    }
    throw error
  }
}

export function cleanupCommittedRuntimePromotion(promotion: RuntimePromotion): void {
  rmSync(promotion.backupRoot, { recursive: true, force: true })
}

export function rollbackRuntimePromotion(promotion: RuntimePromotion): void {
  rmSync(promotion.tempRoot, { recursive: true, force: true })
  if (existsSync(promotion.backupRoot)) {
    rmSync(promotion.pluginRoot, { recursive: true, force: true })
    renameSync(promotion.backupRoot, promotion.pluginRoot)
    promotion.committed = false
  } else if (promotion.committed) {
    rmSync(promotion.pluginRoot, { recursive: true, force: true })
    promotion.committed = false
  }
}
