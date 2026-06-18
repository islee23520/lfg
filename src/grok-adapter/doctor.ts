import { access } from "node:fs/promises"
import { join } from "node:path"
import type { JsonObject } from "../cli/lfg-json"
import { resolveLfgCliLayout } from "../cli/lfg-package-layout"
import { readGrokInstallStamp } from "./install"
import { buildDoctorChecks, doctorChecksJson } from "./doctor-checks"
import { doctorPublishGapJson } from "./doctor-publish-gap"
import { readLfgPackageVersionFromBundle, readPublishRootVersionFromBundle } from "./package-version"
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"
import { verifyGrokInstallSurface } from "./post-install-verify"

export type GrokDoctorOptions = {
  readonly home: string
  readonly pluginDirName?: string
  readonly moduleUrl?: string
  /** Optional registry version for #22 publish gap (env `LFG_DOCTOR_REGISTRY_VERSION` in CLI). */
  readonly registryVersion?: string | null
}

export async function runGrokDoctor(options: GrokDoctorOptions): Promise<JsonObject> {
  const resolved = await resolveGrokAdapterPluginRoot(options.home)
  const pluginDirName = options.pluginDirName ?? resolved?.pluginDirName ?? "lfg"
  const pluginRoot = resolved?.pluginRoot ?? join(options.home, ".grok", "installed-plugins", pluginDirName)
  const configPath = join(options.home, ".grok", "config.toml")
  const pluginExists = resolved !== null || (await pathExists(pluginRoot))
  const configExists = await pathExists(configPath)
  const stamp = pluginExists ? await readGrokInstallStamp(pluginRoot) : null
  const moduleUrl = options.moduleUrl ?? import.meta.url
  const cli = await resolveLfgCliLayout(moduleUrl)
  const installSurface = await verifyGrokInstallSurface({
    home: options.home,
    ...(options.pluginDirName === undefined ? {} : { pluginDirName: options.pluginDirName }),
  })
  const pluginOk = installSurface.ok === true
  const checks = buildDoctorChecks(cli, pluginOk)
  const checkReport = doctorChecksJson(checks)
  const registryVersion = options.registryVersion ?? null
  let localVersion = await readLfgPackageVersionFromBundle(moduleUrl)
  if (localVersion === null && registryVersion !== null) {
    localVersion = await readPublishRootVersionFromBundle(moduleUrl)
  }
  const publishGap = doctorPublishGapJson(localVersion, registryVersion, cli.ok)
  const ok = pluginOk && cli.ok
  return {
    ok,
    status: ok ? "pass" : "fail",
    command: "doctor",
    role: "omo_grok_installer",
    grokHome: join(options.home, ".grok"),
    pluginRoot,
    pluginDirName,
    configPath,
    configExists,
    distribution: stamp === null ? null : { packageName: stamp.packageName, version: stamp.version },
    installSurface,
    ...checkReport,
    ...(publishGap === null ? {} : { publishGap }),
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