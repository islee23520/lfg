import { access } from "node:fs/promises"
import { join } from "node:path"
import type { JsonObject } from "../bin/lfg-json"
import { resolveLfgCliLayout } from "../bin/lfg-package-layout"
import { readGrokInstallStamp } from "./install"
import { verifyGrokInstallSurface } from "./post-install-verify"

export type GrokDoctorOptions = {
  readonly home: string
  readonly pluginDirName?: string
  readonly moduleUrl?: string
}

export async function runGrokDoctor(options: GrokDoctorOptions): Promise<JsonObject> {
  const pluginDirName = options.pluginDirName ?? "lazycodex"
  const pluginRoot = join(options.home, ".grok", "installed-plugins", pluginDirName)
  const configPath = join(options.home, ".grok", "config.toml")
  const pluginExists = await pathExists(pluginRoot)
  const configExists = await pathExists(configPath)
  const stamp = pluginExists ? await readGrokInstallStamp(pluginRoot) : null
  const moduleUrl = options.moduleUrl ?? import.meta.url
  const cli = await resolveLfgCliLayout(moduleUrl)
  const installSurface = await verifyGrokInstallSurface({ home: options.home, pluginDirName })
  const pluginOk = installSurface.ok === true
  const ok = pluginOk && cli.ok
  return {
    ok,
    status: ok ? "pass" : "fail",
    command: "doctor",
    role: "lazycodex_adapter_installer",
    lfgIsPlugin: false,
    grokHome: join(options.home, ".grok"),
    pluginRoot,
    pluginDirName,
    configPath,
    configExists,
    distribution: stamp === null ? null : { packageName: stamp.packageName, version: stamp.version },
    installSurface,
    cli: {
      ok: cli.ok,
      required: true,
      layout: cli.layout,
      distEntry: cli.distEntry,
      packageRoot: cli.packageRoot,
    },
    ...(ok
      ? {}
      : {
          message: !cli.ok
            ? "lfg CLI bundle layout invalid (expected dist/lfg.js from npm package)"
            : "Grok lazycodex plugin or lfg-install.json missing",
        }),
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