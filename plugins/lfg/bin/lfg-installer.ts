import { detectLazycodexAdapter } from "./lfg-grok"
import type { JsonObject } from "./lfg-json"
import { ensureStableLfgPluginLink } from "./lfg-stable-plugin"

export const LAZYCODEX_INSTALLER_ARGS = ["lazycodex-ai", "install"] as const
export const LAZYCODEX_INSTALLER_COMMAND = "npx lazycodex-ai install"

export async function runLazycodexInstaller(): Promise<JsonObject> {
  const proc = Bun.spawn(["npx", ...LAZYCODEX_INSTALLER_ARGS], { stdout: "pipe", stderr: "pipe", env: process.env })
  const [exitCode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
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
