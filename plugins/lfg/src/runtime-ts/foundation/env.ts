import { mkdir, realpath } from "node:fs/promises"
import { isAbsolute, join, resolve, sep } from "node:path"

export const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export type LfgEnv = {
  root: string
  data: string
  stateDir: string
  runsDir: string
  plansDir: string
  launcher: string
}

export type ResolveLfgEnvOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  argv0?: string
}

export function resolveLfgEnv(options: ResolveLfgEnvOptions = {}): LfgEnv {
  const cwd = resolve(options.cwd ?? process.cwd())
  const env = options.env ?? process.env
  const defaultRoot = resolve(cwd, "plugins", "lfg")
  const root = resolve(env.GROK_PLUGIN_ROOT ?? defaultRoot)
  const data = resolve(env.GROK_PLUGIN_DATA ?? join(cwd, ".lfg"))
  return {
    root,
    data,
    stateDir: join(data, "state"),
    runsDir: join(data, "runs"),
    plansDir: join(data, "plans"),
    launcher: env.LFG_LAUNCHER ?? basenameFallback(options.argv0) ?? "lfg",
  }
}

export function validateSafeId(value: string, field = "id"): string {
  if (!SAFE_ID_PATTERN.test(value)) throw new Error(`invalid ${field}: must match ${SAFE_ID_PATTERN.source}`)
  return value
}

export function safeChildPath(root: string, ...parts: string[]): string {
  if (parts.some((part) => isAbsolute(part))) throw new Error(`unsafe absolute path outside ${resolve(root)}: ${parts.join("/")}`)
  const resolvedRoot = resolve(root)
  const candidate = resolve(resolvedRoot, ...parts)
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`)) {
    throw new Error(`unsafe path outside ${resolvedRoot}: ${candidate}`)
  }
  return candidate
}

export async function ensureDirectory(path: string): Promise<string> {
  await mkdir(path, { recursive: true })
  return realpath(path)
}

function basenameFallback(path: string | undefined): string | undefined {
  if (!path) return undefined
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1)
}
