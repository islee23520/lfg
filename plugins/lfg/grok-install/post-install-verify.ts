import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { legacyInstalledGrokPluginRoot, nativeGrokPluginRoot, readGrokInstallStamp } from "./install"
import { readAdapterHooksTrust, resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { componentInventoryPath, type ComponentInventorySource } from "./component-inventory"

export type PostInstallVerifyOptions = {
  readonly home: string
  readonly pluginDirName?: string
}

export type PostInstallVerifyResult = {
  readonly ok: boolean
  readonly status: "verified" | "missing_adapter"
  readonly pluginDirName: string
  readonly pluginRoot: string
  readonly stamp: { readonly packageName: string; readonly version: string } | null
  readonly hooksPath: string | null
  readonly hooksRegistered: boolean
  readonly hookNames: readonly string[]
  readonly hookTrustError: string | null
  readonly componentInventoryPath: string | null
  readonly payloadSource: ComponentInventorySource | null
}

/** Same resolution as doctor: adapter under ~/.grok/plugins/lfg or lazycodex. */
export async function verifyGrokInstallSurface(options: PostInstallVerifyOptions): Promise<PostInstallVerifyResult> {
  const resolved =
    options.pluginDirName === undefined
      ? await resolveGrokAdapterPluginRoot(options.home)
      : await resolveFixedPlugin(options.home, options.pluginDirName)
  if (resolved === null) {
    const pluginDirName = options.pluginDirName ?? "lfg"
    const pluginRoot = join(options.home, ".grok", "installed-plugins", pluginDirName)
    return {
      ok: false,
      status: "missing_adapter",
      pluginDirName,
      pluginRoot,
      stamp: null,
      hooksPath: null,
      hooksRegistered: false,
      hookNames: [],
      hookTrustError: "adapter plugin tree not found",
      componentInventoryPath: null,
      payloadSource: null,
    }
  }
  const { pluginRoot, pluginDirName } = resolved
  const stamp = await readGrokInstallStamp(pluginRoot)
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  const hookTrust = await readAdapterHooksTrust(pluginRoot)
  const hooksOk = hookTrust.ok
  const ok = stamp !== null && hooksOk
  const invPath = componentInventoryPath(pluginRoot)
  const payloadSource = await readPayloadSource(invPath)
  return {
    ok,
    status: ok ? "verified" : "missing_adapter",
    pluginDirName,
    pluginRoot,
    stamp,
    hooksPath,
    hooksRegistered: hooksOk,
    hookNames: hookTrust.hookNames,
    hookTrustError: hookTrust.error,
    componentInventoryPath: invPath,
    payloadSource,
  }
}

async function readPayloadSource(path: string): Promise<ComponentInventorySource | null> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed = JSON.parse(raw) as { source?: unknown }
    const s = parsed?.source
    if (typeof s === "string" && (s === "source_tree" || s === "source_override" || s === "lazycodex_bundle" || s === "fixture_fallback" || s === "repair_adapter")) {
      return s as ComponentInventorySource
    }
    return null
  } catch {
    return null
  }
}

async function resolveFixedPlugin(
  home: string,
  pluginDirName: string,
): Promise<{ readonly pluginDirName: string; readonly pluginRoot: string } | null> {
  for (const pluginRoot of [nativeGrokPluginRoot(home, pluginDirName), legacyInstalledGrokPluginRoot(home, pluginDirName)]) {
    const hookTrust = await readAdapterHooksTrust(pluginRoot)
    if (!hookTrust.ok && hookTrust.error === "hooks.json missing") {
      try {
        await readFile(join(pluginRoot, "lfg-install.json"), "utf8")
        return { pluginDirName, pluginRoot }
      } catch {
        continue
      }
    }
    if (hookTrust.ok || (await readGrokInstallStamp(pluginRoot)) !== null) {
      return { pluginDirName, pluginRoot }
    }
  }
  return (await resolveGrokAdapterPluginRoot(home)) ?? null
}