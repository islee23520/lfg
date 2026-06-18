import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

/**
 * codegraph resolver + env builder.
 *
 * Ported (host-neutral) from `oh-my-openagent` `packages/utils/src/codegraph/`
 * (`env.ts`, `resolve.ts`) so lfg can wrap the external
 * `@colbymchenry/codegraph` semantic-code-graph MCP binary the same way the
 * upstream OpenCode/Codex adapters do. Graph intelligence lives in the
 * external binary; this module only resolves the command and builds the
 * runtime environment. Provisioning (sha256-verified download into
 * `~/.omo/codegraph`) is owned by the SessionStart bootstrap hook.
 *
 * See `docs/grok-adapter-core-port-strategy.md` (Phase 0).
 */

export const CODEGRAPH_INSTALL_DIR_ENV = "CODEGRAPH_INSTALL_DIR"
export const CODEGRAPH_NO_DOWNLOAD_ENV = "CODEGRAPH_NO_DOWNLOAD"
export const CODEGRAPH_TELEMETRY_ENV = "CODEGRAPH_TELEMETRY"
export const DO_NOT_TRACK_ENV = "DO_NOT_TRACK"

export const CODEGRAPH_ENV_BIN = "OMO_CODEGRAPH_BIN"
export const CODEGRAPH_LEGACY_ENV_BIN = "CODEGRAPH_BIN"

export type CodegraphCommandSource = "bundled" | "env" | "path" | "provisioned"

export interface CodegraphCommandResolution {
  readonly argsPrefix: readonly string[]
  readonly command: string
  readonly exists: boolean
  readonly source: CodegraphCommandSource
}

export interface ResolveCodegraphCommandOptions {
  readonly env?: Record<string, string | undefined>
  readonly fileExists?: (filePath: string) => boolean
  readonly homeDir?: string
  readonly provisioned?: () => string | null
  readonly which?: (commandName: string) => string | null
}

export interface BuildCodegraphEnvOptions {
  readonly homeDir?: string
}

export type CodegraphEnv = {
  readonly [CODEGRAPH_INSTALL_DIR_ENV]: string
  readonly [CODEGRAPH_NO_DOWNLOAD_ENV]: "1"
  readonly [CODEGRAPH_TELEMETRY_ENV]: "0"
  readonly [DO_NOT_TRACK_ENV]: "1"
}

/** Install directory for the provisioned codegraph binary (`~/.omo/codegraph`). */
export function defaultCodegraphInstallDir(homeDir: string = homedir()): string {
  return join(homeDir, ".omo", "codegraph")
}

/** Build the runtime env for the codegraph binary (telemetry off, no auto-download). */
export function buildCodegraphEnv(options: BuildCodegraphEnvOptions = {}): CodegraphEnv {
  const homeDir = options.homeDir ?? homedir()
  return {
    [CODEGRAPH_INSTALL_DIR_ENV]: defaultCodegraphInstallDir(homeDir),
    [CODEGRAPH_NO_DOWNLOAD_ENV]: "1",
    [CODEGRAPH_TELEMETRY_ENV]: "0",
    [DO_NOT_TRACK_ENV]: "1",
  }
}

/** Path to a provisioned codegraph binary under an install dir, if present. */
export function provisionedBinFromInstallDir(
  installDir: string | undefined,
  fileExists: (filePath: string) => boolean = existsSync,
): string | null {
  if (installDir === undefined) return null
  const candidate = join(installDir, "bin", process.platform === "win32" ? "codegraph.cmd" : "codegraph")
  return fileExists(candidate) ? candidate : null
}

/**
 * Resolve the codegraph command. Resolution order mirrors upstream:
 * `OMO_CODEGRAPH_BIN`/`CODEGRAPH_BIN` env → provisioned install dir → PATH → bundled.
 */
export function resolveCodegraphCommand(options: ResolveCodegraphCommandOptions = {}): CodegraphCommandResolution {
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? existsSync
  const which = options.which ?? defaultWhich
  const homeDir = options.homeDir ?? homedir()

  // 1. Explicit env override (OMO_CODEGRAPH_BIN / legacy CODEGRAPH_BIN).
  const envBin = (env[CODEGRAPH_ENV_BIN] ?? env[CODEGRAPH_LEGACY_ENV_BIN])?.trim()
  if (envBin !== undefined && envBin.length > 0) {
    const command = looksLikePath(envBin) ? envBin : which(envBin)
    if (command !== null && fileExists(command)) {
      return { argsPrefix: [], command, exists: true, source: "env" }
    }
  }

  // 2. Provisioned install dir (~/.omo/codegraph/bin/codegraph).
  const provisioned = options.provisioned ?? (() => provisionedBinFromInstallDir(defaultCodegraphInstallDir(homeDir), fileExists))
  const provisionedBin = provisioned()
  if (provisionedBin !== null) {
    return { argsPrefix: [], command: provisionedBin, exists: true, source: "provisioned" }
  }

  // 3. PATH lookup.
  const pathBin = which("codegraph")
  if (pathBin !== null && fileExists(pathBin)) {
    return { argsPrefix: [], command: pathBin, exists: true, source: "path" }
  }

  // 4. Bundled (not currently shipped by lfg); report not found.
  return { argsPrefix: [], command: "codegraph", exists: false, source: "bundled" }
}

function looksLikePath(command: string): boolean {
  return command.includes("/") || command.includes("\\") || /^[a-zA-Z]:/.test(command)
}

function defaultWhich(commandName: string): string | null {
  // Spawn `which`/`where` to locate the binary; conservative fallback.
  const tool = process.platform === "win32" ? "where" : "which"
  try {
    const result = spawnSync(tool, [commandName], { encoding: "utf8", timeout: 2_000, windowsHide: true })
    if (result.error !== undefined || result.status !== 0) return null
    const line = `${result.stdout}\n${result.stderr}`.split(/\r?\n/)[0]?.trim()
    return line !== undefined && line.length > 0 ? line : null
  } catch {
    return null
  }
}

/** Grok MCP config entry shape for codegraph. */
export interface CodegraphMcpEntry {
  readonly command: readonly string[]
  readonly enabled: boolean
  readonly environment: Record<string, string>
}

export interface CreateCodegraphMcpEntryOptions extends ResolveCodegraphCommandOptions {
  readonly installDir?: string
}

/**
 * Build the Grok `.mcp.json` entry for codegraph. Mirrors upstream
 * `createCodegraphMcpConfig()` (`omo-opencode/src/mcp/codegraph.ts`):
 * `[binary, "serve", "--mcp"]`, enabled only when the binary resolves.
 */
export function createCodegraphMcpEntry(options: CreateCodegraphMcpEntryOptions = {}): CodegraphMcpEntry {
  const homeDir = options.homeDir ?? homedir()
  const resolved = resolveCodegraphCommand({
    env: options.env,
    fileExists: options.fileExists,
    homeDir,
    provisioned: options.provisioned,
    which: options.which,
  })
  const env = buildCodegraphEnv({ homeDir })
  const environment = options.installDir === undefined ? env : { ...env, [CODEGRAPH_INSTALL_DIR_ENV]: options.installDir }
  return {
    command: [resolved.command, ...resolved.argsPrefix, "serve", "--mcp"],
    enabled: resolved.exists,
    environment,
  }
}
