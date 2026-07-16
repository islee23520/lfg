import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { buildUninstallPlan } from "../../core/lfg/uninstall/plan"
import { executeUninstall } from "../../core/lfg/uninstall/execute"
import type { UninstallOptions, UninstallResult } from "../../core/lfg/uninstall/types"
import { LFG_OWNED_GROK_CONFIG_SECTIONS } from "../config/lfg-grok-config"
import { removeTomlKey, removeTomlSectionsByPrefix } from "../config/lfg-grok-config-toml"

export type UninstallCommandArgs = {
  readonly home: string
  readonly argv: readonly string[]
}

export async function dispatchUninstallCommand(args: UninstallCommandArgs): Promise<UninstallResult> {
  const yes = args.argv.includes("--yes")
  const cwdValue = valueAfter(args.argv, "--cwd")
  const options: UninstallOptions = {
    home: args.home,
    cwd: cwdValue === null ? process.cwd() : resolve(cwdValue),
    dryRun: !yes || args.argv.includes("--dry-run"),
    keepConfig: args.argv.includes("--keep-config"),
    keepOverrides: args.argv.includes("--keep-overrides"),
    purgeProjectOrchestrator: args.argv.includes("--purge-project-orchestrator"),
  }
  const plan = await buildUninstallPlan(options)
  return executeUninstall(plan, options, stripLfgConfig)
}

async function stripLfgConfig(path: string): Promise<boolean> {
  let source: string
  try {
    source = await readFile(path, "utf8")
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
  const sectionPrefixes = [
    ...LFG_OWNED_GROK_CONFIG_SECTIONS.filter((entry) => !entry.includes(".default") && !entry.includes(".models_base_url")),
    "omo.models",
    "omo.agents.",
    "omo.backend_routing",
    "model.",
  ]
  const withoutSections = sectionPrefixes.reduce(
    (text, prefix) => removeTomlSectionsByPrefix(text, prefix),
    removeTomlSectionsByPrefix(source, "lazycodex."),
  )
  const withoutEndpointKey = removeTomlKey(withoutSections, "endpoints", "models_base_url")
  const next = removeTomlKey(withoutEndpointKey, "models", "default")
  await writeFile(path, next, "utf8")
  return true
}

function valueAfter(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag)
  const value = index < 0 ? undefined : argv[index + 1]
  return typeof value === "string" ? value : null
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
