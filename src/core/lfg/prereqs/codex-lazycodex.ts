/**
 * Codex CLI + LazyCodex (omo Codex Light) prerequisites for lfg.
 * lfg hands implementation work to Codex LazyCodex — both must be present.
 */
import { access, readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { findExecutableInPath } from "../../../shared/executable-path"
import {
  codexInstallRecipes as resolveCodexInstallRecipes,
  agyInstallRecipes as resolveAgyInstallRecipes,
  gjcInstallRecipes as resolveGjcInstallRecipes,
} from "./topology-prereqs"
import type {
  InstallRecipe,
  InstallRunner,
  InstallToolResult,
  PrereqPlatform,
  PrereqReport,
  PrereqToolId,
  ToolProbe,
} from "./topology-prereqs"

export type {
  InstallRecipe,
  InstallRunner,
  InstallToolResult,
  PrereqPlatform,
  PrereqReport,
  PrereqToolId,
  ToolProbe,
} from "./topology-prereqs"

const execFileAsync = promisify(execFile)

export type PrereqProbeOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly platform?: NodeJS.Platform
  readonly home?: string
}

export function resolvePrereqPlatform(platform: NodeJS.Platform = process.platform): PrereqPlatform {
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform
  return "other"
}

export function codexInstallRecipes(platform: PrereqPlatform = resolvePrereqPlatform()): readonly InstallRecipe[] {
  return resolveCodexInstallRecipes(platform)
}

export function lazycodexInstallRecipes(_platform: PrereqPlatform = resolvePrereqPlatform()): readonly InstallRecipe[] {
  return []
}

export function gjcInstallRecipes(_platform: PrereqPlatform = resolvePrereqPlatform()): readonly InstallRecipe[] {
  return resolveGjcInstallRecipes()
}

export function agyInstallRecipes(_platform: PrereqPlatform = resolvePrereqPlatform()): readonly InstallRecipe[] {
  return resolveAgyInstallRecipes()
}

export async function probeCodexLazyCodexPrereqs(options: PrereqProbeOptions = {}): Promise<PrereqReport> {
  const env = options.env ?? process.env
  const platform = resolvePrereqPlatform(options.platform ?? process.platform)
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? homedir()

  const codexPath = await findExecutableInPath("codex", env, options.platform ?? process.platform)
  const codexOk = codexPath !== null
  const codex: ToolProbe = {
    id: "codex",
    required: true,
    ok: codexOk,
    status: codexOk ? "ready" : "missing",
    binary: "codex",
    commandPath: codexPath,
    detail: codexOk ? `Codex CLI found at ${codexPath}` : "Codex CLI not found on PATH (required for lfg handoff)",
    recipes: codexInstallRecipes(platform),
  }

  const lazy = await probeLazyCodex(home, env)
  const lazycodex: ToolProbe = {
    id: "lazycodex",
    required: false,
    ok: lazy.ok,
    status: lazy.ok ? "ready" : "missing",
    binary: "lazycodex-ai",
    commandPath: null,
    detail: lazy.detail,
    recipes: [],
  }

  const gjcPath = await findExecutableInPath("gjc", env, options.platform ?? process.platform)
  const gjcOk = gjcPath !== null
  const gjc: ToolProbe = {
    id: "gjc",
    required: false,
    ok: gjcOk,
    status: gjcOk ? "ready" : "missing",
    binary: "gjc",
    commandPath: gjcPath,
    detail: gjcOk ? `Gajae-Code CLI found at ${gjcPath}` : "Gajae-Code CLI (gjc) not found on PATH (intent gateway)",
    recipes: gjcInstallRecipes(platform),
  }

  const agyPath = await findExecutableInPath("agy", env, options.platform ?? process.platform)
  const agyOk = agyPath !== null
  const agy: ToolProbe = {
    id: "agy",
    required: false,
    ok: agyOk,
    status: agyOk ? "ready" : "missing",
    binary: "agy",
    commandPath: agyPath,
    detail: agyOk ? `Antigravity CLI found at ${agyPath}` : "Antigravity CLI (agy) not found on PATH (optional vision confirmation)",
    recipes: agyInstallRecipes(platform),
  }

  const missing = [
    ...(codex.ok ? [] : (["codex"] as const)),
  ]
  const recommendedMissing = [
    ...(gjc.ok ? [] : (["gjc"] as const)),
    ...(agy.ok ? [] : (["agy"] as const)),
  ]
  return {
    platform,
    ok: missing.length === 0,
    codex,
    lazycodex,
    gjc,
    agy,
    missing,
    recommendedMissing,
  }
}

async function probeLazyCodex(
  home: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<{ ok: boolean; detail: string }> {
  const codexHome = env.CODEX_HOME ?? join(home, ".codex")
  const cacheRoot = join(codexHome, "plugins", "cache", "sisyphuslabs")
  const configPath = join(codexHome, "config.toml")

  if (await pathExists(cacheRoot)) {
    try {
      const entries = await readdir(cacheRoot)
      if (entries.some((name) => name === "omo" || name.startsWith("omo"))) {
        return { ok: true, detail: `LazyCodex/omo plugin cache present under ${cacheRoot}` }
      }
      if (entries.length > 0) {
        return { ok: true, detail: `LazyCodex marketplace cache present under ${cacheRoot}` }
      }
    } catch {
      // fall through
    }
  }

  if (await pathExists(configPath)) {
    try {
      const text = await readFile(configPath, "utf8")
      if (
        /sisyphuslabs/i.test(text) ||
        /omo@sisyphuslabs/i.test(text) ||
        /plugins\.cache.*omo/i.test(text) ||
        /\[plugins\.omo\]/i.test(text)
      ) {
        return { ok: true, detail: `LazyCodex/omo references found in ${configPath}` }
      }
    } catch {
      // fall through
    }
  }

  // npm package presence is not sufficient; require Codex Light materialization.
  return {
    ok: false,
    detail: `LazyCodex (omo Codex Light) not detected under ${codexHome} — run npx lazycodex-ai install`,
  }
}

export async function installPrereqTool(
  tool: PrereqToolId,
  options: {
    readonly platform?: NodeJS.Platform
    readonly env?: Readonly<Record<string, string | undefined>>
    readonly recipeId?: string
    readonly runner?: InstallRunner
  } = {},
): Promise<InstallToolResult> {
  const platform = resolvePrereqPlatform(options.platform ?? process.platform)
  const env = options.env ?? process.env
  const recipes = tool === "codex" ? codexInstallRecipes(platform) : tool === "lazycodex" ? lazycodexInstallRecipes(platform) : tool === "gjc" ? gjcInstallRecipes(platform) : agyInstallRecipes(platform)
  const recipe =
    (options.recipeId === undefined ? undefined : recipes.find((r) => r.id === options.recipeId)) ??
    recipes[0]
  if (recipe === undefined) {
    return {
      ok: false,
      tool,
      recipeId: "none",
      command: "",
      args: [],
      stdout: "",
      stderr: "",
      error: `No install recipe for ${tool} on ${platform}`,
    }
  }

  if (options.runner) {
    return options.runner(recipe, env)
  }
  return runInstallRecipe(tool, recipe, env)
}

export async function runInstallRecipe(
  tool: PrereqToolId,
  recipe: InstallRecipe,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<InstallToolResult> {
  try {
    const command = process.platform === "win32" && recipe.command === "npm" ? "npm.cmd" : recipe.command
    const result = await execFileAsync(command, [...recipe.args], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 10 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    return {
      ok: true,
      tool,
      recipeId: recipe.id,
      command: recipe.command,
      args: recipe.args,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  } catch (error) {
    const failure = normalizeExecFailure(error)
    return {
      ok: false,
      tool,
      recipeId: recipe.id,
      command: recipe.command,
      args: recipe.args,
      stdout: failure.stdout,
      stderr: failure.stderr,
      error: failure.message,
    }
  }
}

export function prereqReportJson(report: PrereqReport): Record<string, unknown> {
  return {
    ok: report.ok,
    platform: report.platform,
    missing: [...report.missing],
    codex: probeJson(report.codex),
    lazycodex: probeJson(report.lazycodex),
    gjc: probeJson(report.gjc),
    agy: probeJson(report.agy),
    recommendedMissing: [...report.recommendedMissing],
  }
}

function probeJson(probe: ToolProbe): Record<string, unknown> {
  return {
    id: probe.id,
    required: probe.required,
    ok: probe.ok,
    status: probe.status,
    binary: probe.binary,
    commandPath: probe.commandPath,
    detail: probe.detail,
    recipes: probe.recipes.map((r) => ({
      id: r.id,
      label: r.label,
      shellHint: r.shellHint,
      docsUrl: r.docsUrl,
    })),
  }
}

function normalizeExecFailure(error: unknown): { readonly message: string; readonly stdout: string; readonly stderr: string } {
  if (error instanceof Error) {
    const withOutput = error as Error & { readonly stdout?: unknown; readonly stderr?: unknown }
    return {
      message: error.message,
      stdout: typeof withOutput.stdout === "string" ? withOutput.stdout : "",
      stderr: typeof withOutput.stderr === "string" ? withOutput.stderr : "",
    }
  }
  return { message: String(error), stdout: "", stderr: "" }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
