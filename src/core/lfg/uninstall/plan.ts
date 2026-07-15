import { access } from "node:fs/promises"
import { join } from "node:path"
import type { UninstallOptions, UninstallPath, UninstallPathKind, UninstallPlan } from "./types"

const AGENT_NAMES = [
  "sisyphus", "watcher", "lazycodex", "explorer", "git-master", "hephaestus", "prometheus", "atlas", "oracle",
  "sisyphus-junior",
] as const

export async function buildUninstallPlan(options: UninstallOptions): Promise<UninstallPlan> {
  const grok = join(options.home, ".grok")
  const configPath = join(grok, "config.toml")
  const overridePaths = [join(grok, "omo-agent-overrides.json"), join(grok, "lazycodex-agent-overrides.json")]
  const candidates: readonly [UninstallPathKind, string][] = [
    ["directory", join(grok, "plugins", "lfg")],
    ["directory", join(grok, "installed-plugins", "lfg")],
    ["file", join(grok, "hooks", "lfg-hooks.json")],
    ["directory", join(grok, "prompts", "lazycodex")],
    ["file", join(grok, "bin", "lfg")],
    ["file", configPath],
    ...AGENT_NAMES.flatMap((name): readonly [UninstallPathKind, string][] => [
      ["file", join(grok, "agents", `${name}.md`)],
      ["file", join(grok, "roles", `${name}.toml`)],
      ["file", join(grok, "personas", `${name}.toml`)],
      ["file", join(grok, "prompts", "omo", `${name}.md`)],
    ]),
    ...overridePaths.map((path): [UninstallPathKind, string] => ["file", path]),
    ...(options.purgeProjectOrchestrator
      ? [["file", join(options.cwd, ".omo", "orchestrator", "inbox.json")] satisfies [UninstallPathKind, string]]
      : []),
  ]
  const paths: UninstallPath[] = []
  for (const [kind, path] of candidates) paths.push({ kind, path, exists: await pathExists(path) })
  return { paths, configPath, overridePaths }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
