import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { cwd as processCwd, env as processEnv, stderr as processStderr } from "node:process"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { buildCodegraphEnv, resolveCodegraphCommand, provisionedBinFromInstallDir, type ResolveCodegraphCommandOptions } from "./codegraph-resolve"
import { ensureCodegraphProvisioned } from "./codegraph-provision"
import { evaluateCodegraphNodeSupport, type CodegraphNodeSupport } from "./codegraph-node-support"

/**
 * Codegraph SessionStart bootstrap worker.
 *
 * Ported (host-neutral) from `oh-my-openagent` `omo-codex/plugin/components/codegraph/src/session-start-worker.ts`
 * so lfg can bootstrap the external `@colbymchenry/codegraph` binary the same way
 * the upstream OpenCode/Codex adapters do. See
 * `docs/grok-adapter-core-port-strategy.md` (Phase 0).
 *
 * The worker:
 *  1. Resolves the codegraph command (env → provisioned → PATH).
 *  2. If unresolved and Node is supported, provisions (sha256 download).
 *  3. Runs `codegraph status --json`, then `init` or `sync` as needed.
 *  4. Appends a structured outcome to `~/.omo/codegraph/session-start.log`.
 */

const execFileAsync = promisify(execFile)

export const CODEGRAPH_VERSION = "1.0.1" as const
const COMMAND_TIMEOUT_MS = 60_000
export const SESSION_START_CWD_ENV = "LFG_CODEGRAPH_SESSION_START_CWD"

export type CodegraphSessionStartAction =
  | "skipped-disabled"
  | "skipped-unavailable"
  | "skipped-unsupported-node"
  | "skipped-status"
  | "initialized"
  | "synced"
  | "no-op"
  | "failed"

export interface CodegraphConfig {
  readonly auto_provision?: boolean
  readonly enabled?: boolean
  readonly install_dir?: string
}

export interface CodegraphSessionStartOutcome {
  readonly action: CodegraphSessionStartAction
  readonly projectRoot: string
  readonly error?: string
  readonly source?: string
  readonly exitCode?: number
  readonly timedOut?: boolean
}

export interface CodegraphSessionStartOptions {
  readonly config?: CodegraphConfig
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly homeDir?: string
  readonly nodeVersion?: string
  readonly resolveCommand?: (options: ResolveCodegraphCommandOptions) => ReturnType<typeof resolveCodegraphCommand>
  readonly ensureProvisioned?: typeof ensureCodegraphProvisioned
  readonly runCommand?: (cwd: string, command: string, args: readonly string[], options: { env: Record<string, string>; timeoutMs: number }) => Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>
  readonly logOutcome?: (outcome: CodegraphSessionStartOutcome) => void
}

/**
 * Run the codegraph SessionStart bootstrap. Returns the action taken.
 * Never throws — all failures are captured as `{ action: "failed" }`.
 */
export async function runCodegraphSessionStart(options: CodegraphSessionStartOptions = {}): Promise<{ action: CodegraphSessionStartAction }> {
  const env = options.env ?? processEnv
  const homeDir = options.homeDir ?? homedir()
  const projectRoot = options.cwd ?? env[SESSION_START_CWD_ENV] ?? processCwd()
  const config = options.config ?? {}
  const logOutcome = options.logOutcome ?? ((outcome) => appendOutcome(homeDir, outcome))

  if (config.enabled === false) {
    return finish("skipped-disabled", { projectRoot }, logOutcome)
  }

  const nodeSupport = evaluateCodegraphNodeSupport({ env, nodeVersion: options.nodeVersion })

  try {
    const resolution = resolveOrProvision({
      config,
      env,
      homeDir,
      nodeSupport,
      resolveCommand: options.resolveCommand ?? resolveCodegraphCommand,
      ensureProvisioned: options.ensureProvisioned ?? ensureCodegraphProvisioned,
    })

    if (resolution.kind === "unavailable") {
      return finish("skipped-unavailable", { error: resolution.error, projectRoot, source: resolution.source }, logOutcome)
    }
    if (resolution.kind === "unsupported-node") {
      return finish("skipped-unsupported-node", { projectRoot }, logOutcome)
    }

    const command = resolution.command
    const codegraphEnv = config.install_dir === undefined ? buildCodegraphEnv({ homeDir }) : { ...buildCodegraphEnv({ homeDir }), CODEGRAPH_INSTALL_DIR: config.install_dir }
    const runCommand = options.runCommand ?? defaultRunCommand

    const status = await runCommand(projectRoot, command, [...resolution.argsPrefix, "status", "--json"], { env: codegraphEnv, timeoutMs: COMMAND_TIMEOUT_MS })
    const decision = decideStartupAction(status)
    if (decision.kind === "skip") {
      return finish("skipped-status", { error: decision.reason, projectRoot }, logOutcome)
    }

    const actionArgs = resolution.argsPrefix.concat(decision.kind === "init" ? ["init"] : ["sync"])
    const actionResult = await runCommand(projectRoot, command, actionArgs, { env: codegraphEnv, timeoutMs: COMMAND_TIMEOUT_MS })
    return finish(decision.kind === "init" ? "initialized" : "synced", { exitCode: actionResult.exitCode, projectRoot, source: resolution.source, timedOut: actionResult.timedOut }, logOutcome)
  } catch (error) {
    return finish("failed", { error: error instanceof Error ? error.message : String(error), projectRoot }, logOutcome)
  }
}

type ResolutionResult =
  | { readonly kind: "resolved"; readonly command: string; readonly argsPrefix: readonly string[]; readonly source: string }
  | { readonly kind: "unsupported-node" }
  | { readonly error: string; readonly kind: "unavailable"; readonly source: string }

function resolveOrProvision(args: {
  config: CodegraphConfig
  env: Record<string, string | undefined>
  homeDir: string
  nodeSupport: CodegraphNodeSupport
  resolveCommand: (options: ResolveCodegraphCommandOptions) => ReturnType<typeof resolveCodegraphCommand>
  ensureProvisioned: typeof ensureCodegraphProvisioned
}): ResolutionResult {
  const resolved = args.resolveCommand({
    env: args.env,
    homeDir: args.homeDir,
    provisioned: () => provisionedBinFromInstallDir(args.config.install_dir),
  })
  if (resolved.exists) {
    if (resolved.source !== "bundled" && resolved.source !== "env" && !args.nodeSupport.supported) {
      return { kind: "unsupported-node" }
    }
    return { kind: "resolved", command: resolved.command, argsPrefix: resolved.argsPrefix, source: resolved.source }
  }
  if (!args.nodeSupport.supported) return { kind: "unsupported-node" }
  if (args.config.auto_provision === false) {
    return { error: "codegraph binary unavailable and auto_provision is disabled", kind: "unavailable", source: resolved.source }
  }

  // Provisioning is async; surface as unavailable here and let the caller kick
  // off provisioning separately. The SessionStart detached worker (wired by the
  // installer) calls ensureCodegraphProvisioned directly before re-resolving.
  return { error: "codegraph binary not provisioned; run ensureCodegraphProvisioned first", kind: "unavailable", source: resolved.source }
}

interface StatusDecision {
  readonly kind: "init" | "sync" | "skip"
  readonly reason?: string
}

function decideStartupAction(status: { exitCode: number; stdout: string; stderr: string; timedOut: boolean }): StatusDecision {
  if (status.timedOut) return { kind: "skip", reason: "status timed out" }
  if (status.exitCode !== 0) return { kind: "init" }
  // `codegraph status --json` returns JSON indicating whether the graph exists.
  // If the JSON indicates an existing graph, sync; otherwise init.
  const out = `${status.stdout}\n${status.stderr}`.trim()
  if (out.length === 0) return { kind: "init" }
  try {
    const parsed = JSON.parse(out) as { initialized?: boolean; exists?: boolean }
    if (parsed.initialized === true || parsed.exists === true) return { kind: "sync" }
    return { kind: "init" }
  } catch {
    // Non-JSON status output: treat as needing init.
    return { kind: "init" }
  }
}

function finish(action: CodegraphSessionStartAction, detail: Omit<CodegraphSessionStartOutcome, "action">, logOutcome: (outcome: CodegraphSessionStartOutcome) => void): { action: CodegraphSessionStartAction } {
  safeLogOutcome(logOutcome, { ...detail, action })
  return { action }
}

function safeLogOutcome(logOutcome: (outcome: CodegraphSessionStartOutcome) => void, outcome: CodegraphSessionStartOutcome): void {
  try {
    logOutcome(outcome)
  } catch {
    // Logging must never break the bootstrap.
  }
}

function appendOutcome(homeDir: string, outcome: CodegraphSessionStartOutcome): void {
  const logDir = join(homeDir, ".omo", "codegraph")
  try {
    mkdirSync(logDir, { recursive: true })
    appendFileSync(join(logDir, "session-start.log"), `${JSON.stringify({ ...outcome, ts: new Date().toISOString() })}\n`, "utf8")
  } catch {
    // Best-effort log.
  }
}

async function defaultRunCommand(cwd: string, command: string, args: readonly string[], runOptions: { env: Record<string, string>; timeoutMs: number }): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], { cwd, env: runOptions.env, timeout: runOptions.timeoutMs, maxBuffer: 1024 * 1024 })
    return { exitCode: 0, stdout, stderr, timedOut: false }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; signal?: string }
    if (err.killed === true || err.signal === "SIGTERM") {
      return { exitCode: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "", timedOut: true }
    }
    return { exitCode: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "", timedOut: false }
  }
}

export { execFileAsync, existsSync }
