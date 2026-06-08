import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { JsonObject } from "../bin/lfg-json"
import { validateGrokHooksJson } from "./hook-trust"
import { readGrokInstallStamp } from "./install"

export type PostInstallVerifyOptions = {
  readonly home: string
  readonly pluginDirName?: string
}

/** Same resolution as doctor: stamp under ~/.grok/installed-plugins/<name>. */
export async function verifyGrokInstallSurface(options: PostInstallVerifyOptions): Promise<JsonObject> {
  const pluginDirName = options.pluginDirName ?? "lazycodex"
  const grokHome = join(options.home, ".grok")
  const pluginRoot = join(grokHome, "installed-plugins", pluginDirName)
  const configPath = join(grokHome, "config.toml")
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  const pluginExists = await pathExists(pluginRoot)
  const stamp = pluginExists ? await readGrokInstallStamp(pluginRoot) : null
  const hooksExists = await pathExists(hooksPath)
  const hookTrust = hooksExists ? await readHookTrust(hooksPath) : { ok: false, hookNames: [] as readonly string[], error: "hooks.json missing" }
  const configExists = await pathExists(configPath)
  const hooksOk = !hooksExists || hookTrust.ok
  const ok = pluginExists && stamp !== null && hooksOk
  return {
    status: ok ? "verified" : "missing_adapter",
    ok,
    pluginDirName,
    pluginRoot,
    grokHome,
    configPath,
    configExists,
    hooksPath,
    hooksRegistered: hooksExists && hookTrust.ok,
    hookNames: hookTrust.hookNames,
    hookTrustError: hookTrust.error,
    distribution: stamp === null ? null : { packageName: stamp.packageName, version: stamp.version },
  }
}

async function readHookTrust(hooksPath: string): Promise<{ readonly ok: boolean; readonly hookNames: readonly string[]; readonly error: string | null }> {
  try {
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    return validateGrokHooksJson(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, hookNames: [], error: message }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}