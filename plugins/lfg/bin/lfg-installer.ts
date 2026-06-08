import { execFile } from "node:child_process"
import type { JsonObject } from "./lfg-json"
import type { ModelDiscovery } from "./lfg-models"
import { modelDiscoveryEnv } from "./lfg-models"
import {
  configFieldsFromRun,
  grokInstallStepJson,
  INTERNAL_GROK_INSTALL_COMMAND,
  INTERNAL_GROK_INSTALL_PACKAGE,
  runGrokInstall,
} from "../grok-install/run-grok-install"
import { verifyGrokInstallSurface } from "../grok-install/post-install-verify"

export const LAZYCODEX_INSTALLER_ARGS = ["lazycodex-ai", "install"] as const
export const LAZYCODEX_INSTALLER_COMMAND = "npx lazycodex-ai install"

/** @deprecated Default path uses internal grok install; kept for JSON compatibility. */
export const LFP_INSTALLER_ARGS = [] as const
export const LFP_INSTALLER_COMMAND = INTERNAL_GROK_INSTALL_COMMAND

type InstallerStep = {
  readonly packageName: string
  readonly command: string
  readonly args: readonly string[]
}

const LAZYCODEX_STEP: InstallerStep = {
  packageName: "lazycodex-ai",
  command: LAZYCODEX_INSTALLER_COMMAND,
  args: LAZYCODEX_INSTALLER_ARGS,
}

type InstallerStepResult = InstallerStep & {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export async function runLazycodexInstaller(discovery: ModelDiscovery | null = null): Promise<JsonObject> {
  const agentConfig = discovery?.agentConfig ?? null
  const env = mergeStringEnv(process.env, modelDiscoveryEnv(discovery, agentConfig))
  const lazycodex = await execFileResult("npx", LAZYCODEX_INSTALLER_ARGS, env)
  const lazycodexResult: InstallerStepResult = { ...LAZYCODEX_STEP, ...lazycodex }
  if (lazycodex.exitCode !== 0) {
    return installJson({
      ok: false,
      status: "install_failed",
      discovery,
      installers: [lazycodexResult],
      failedExit: lazycodex.exitCode,
    })
  }

  const grokRun = await runGrokInstall(discovery, env)
  const internalResult = grokInstallStepJson(grokRun.internalStep) as InstallerStepResult
  const installers = [lazycodexResult, internalResult]
  const ok = grokRun.ok
  const home = env.HOME ?? process.env.HOME ?? ""
  const postInstallVerify = home.length > 0 ? await verifyGrokInstallSurface({ home }) : { status: "missing_adapter", ok: false }
  const agentTomlPaths = grokRun.agentTomls?.written ?? []
  return installJson({
    ok,
    status: ok ? "installed" : "install_failed",
    discovery,
    installers,
    failedExit: ok ? 0 : internalResult.exitCode,
    ...configFieldsFromRun(grokRun.configUpdate),
    postInstallVerify,
    agentTomlPaths,
  })
}

function installJson(fields: {
  readonly ok: boolean
  readonly status: string
  readonly discovery: ModelDiscovery | null
  readonly installers: readonly InstallerStepResult[]
  readonly failedExit: number
} & JsonObject): JsonObject {
  const { ok, status, discovery, installers, failedExit, ...rest } = fields
  return {
    ok,
    status,
    command: "setup",
    executed: true,
    role: "lazycodex_adapter_installer",
    adapterPackage: "lazycodex-ai",
    companionPackage: INTERNAL_GROK_INSTALL_PACKAGE,
    installerCommand: LAZYCODEX_INSTALLER_COMMAND,
    installerArgs: [...LAZYCODEX_INSTALLER_ARGS],
    grokInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerCommand: INTERNAL_GROK_INSTALL_COMMAND,
    lfpInstallerArgs: [],
    installers,
    exitCode: failedExit,
    stdout: installers.map((installer) => installer.stdout).filter((value) => value.length > 0).join("\n"),
    stderr: installers.map((installer) => installer.stderr).filter((value) => value.length > 0).join("\n"),
    lfgIsPlugin: false,
    ...(discovery === null ? {} : { modelDiscovery: discovery }),
    ...rest,
  }
}

function mergeStringEnv(base: NodeJS.ProcessEnv, extra: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === "string") {
      out[key] = value
    }
  }
  return { ...out, ...extra }
}

function execFileResult(file: string, args: readonly string[], env: Readonly<Record<string, string>>): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout, stderr })
    })
  })
}