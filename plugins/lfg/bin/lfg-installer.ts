import { execFile } from "node:child_process"
import { detectLazycodexAdapter } from "./lfg-grok"
import type { JsonObject } from "./lfg-json"
import { ensureStableLfgPluginLink } from "./lfg-stable-plugin"

export const LAZYCODEX_INSTALLER_ARGS = ["lazycodex-ai", "install"] as const
export const LAZYCODEX_INSTALLER_COMMAND = "npx lazycodex-ai install"

export async function runLazycodexInstaller(): Promise<JsonObject> {
  const { exitCode, stdout, stderr } = await execFileResult("npx", LAZYCODEX_INSTALLER_ARGS)
  const ok = exitCode === 0
  const stablePluginLink = ok ? await ensureStableLfgPluginLink(detectLazycodexAdapter({ preferStableInstalledPlugin: false, preferHashInstalledPlugin: true })) : null
  return {
    ok,
    status: ok ? "installed" : "install_failed",
    executed: true,
    role: "lazycodex_adapter_installer",
    adapterPackage: "lazycodex-ai",
    installerCommand: LAZYCODEX_INSTALLER_COMMAND,
    installerArgs: [...LAZYCODEX_INSTALLER_ARGS],
    exitCode,
    stdout,
    stderr,
    stablePluginLink,
  }
}

function execFileResult(file: string, args: readonly string[]): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { env: process.env }, (error, stdout, stderr) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout, stderr })
    })
  })
}
