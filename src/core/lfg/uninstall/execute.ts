import { rm } from "node:fs/promises"
import type { UninstallOptions, UninstallPlan, UninstallResult } from "./types"

export type StripUninstallConfig = (path: string) => Promise<boolean>

export async function executeUninstall(
  plan: UninstallPlan,
  options: UninstallOptions,
  stripConfig: StripUninstallConfig,
): Promise<UninstallResult> {
  if (options.dryRun) return result("uninstall_planned", true, plan, [], [], [])
  const removed: string[] = []
  const skipped: string[] = []
  const kept: string[] = []
  for (const item of plan.paths) {
    if (item.path === plan.configPath) {
      continue
    } else if (options.keepOverrides && plan.overridePaths.includes(item.path)) {
      kept.push(item.path)
    } else if (!item.exists) {
      skipped.push(item.path)
    } else {
      await rm(item.path, { recursive: item.kind === "directory", force: true })
      removed.push(item.path)
    }
  }
  if (options.keepConfig) kept.push(plan.configPath)
  else if (await stripConfig(plan.configPath)) removed.push(plan.configPath)
  else skipped.push(plan.configPath)
  return result("uninstalled", false, plan, removed, skipped, kept)
}

function result(
  status: UninstallResult["status"],
  dryRun: boolean,
  plan: UninstallPlan,
  removed: readonly string[],
  skipped: readonly string[],
  kept: readonly string[],
): UninstallResult {
  return { ok: true, status, dryRun, paths: plan.paths, removed, skipped, kept, lfgIsPlugin: false }
}
