import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { readGrokInstallStamp } from "./install"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
export type PostInstallVerifyOptions = {
  readonly home: string
  readonly pluginDirName?: string
}

/** Same resolution as doctor: adapter under ~/.grok/installed-plugins/lfg or lazycodex. */
export async function verifyGrokInstallSurface(options: PostInstallVerifyOptions) {
  const resolved =
    options.pluginDirName === undefined
      ? await resolveGrokAdapterPluginRoot(options.home)
      : await resolveFixedPlugin(options.home, options.pluginDirName)
  if (resolved === null) {
    return {
      ok: false,
      status: "missing_adapter" as const,
      pluginDirName: options.pluginDirName ?? "lfg",
      pluginRoot: join(options.home, ".grok", "installed-plugins", options.pluginDirName ?? "lfg"),
      stamp: null,
      hooksPath: null,
      hooksRegistered: false,
      hookNames: [] as readonly string[],
      hookTrustError: "adapter plugin tree not found",
    }
  }
  const { pluginRoot, pluginDirName } = resolved
  const stamp = await readGrokInstallStamp(pluginRoot)
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  const hookTrust = await readAdapterHooksTrust(pluginRoot)
  const hooksOk = hookTrust.ok
  const ok = stamp !== null && hooksOk
  return {
    ok,
    status: ok ? ("verified" as const) : ("missing_adapter" as const),
    pluginDirName,
    pluginRoot,
    stamp,
    hooksPath,
    hooksRegistered: hooksOk,
    hookNames: hookTrust.hookNames,
    hookTrustError: hookTrust.error,
  }
}

async function resolveFixedPlugin(
  home: string,
  pluginDirName: string,
): Promise<{ readonly pluginDirName: string; readonly pluginRoot: string } | null> {
  const pluginRoot = join(home, ".grok", "installed-plugins", pluginDirName)
  const hookTrust = await readAdapterHooksTrust(pluginRoot)
  if (!hookTrust.ok && hookTrust.error === "hooks.json missing") {
    try {
      await readFile(join(pluginRoot, "lfg-install.json"), "utf8")
      return { pluginDirName, pluginRoot }
    } catch {
      return null
    }
  }
  if (hookTrust.ok || (await readGrokInstallStamp(pluginRoot)) !== null) {
    return { pluginDirName, pluginRoot }
  }
  return (await resolveGrokAdapterPluginRoot(home)) ?? null
}