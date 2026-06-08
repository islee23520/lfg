import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { JsonObject } from "../bin/lfg-json"
import { installGrokPluginFromSource } from "./install"
import { readLfgPackageVersionFromBundle } from "./package-version"

export async function runInternalGrokInstall(env: NodeJS.ProcessEnv = process.env): Promise<JsonObject> {
  const home = env.HOME ?? homedir()
  const sourceRoot = env.LFG_GROK_INSTALL_SOURCE_ROOT ?? defaultFixtureSourceRoot()
  const version =
    env.LFG_PACKAGE_VERSION ??
    (await readLfgPackageVersionFromBundle(import.meta.url)) ??
    "0.0.0-dev"
  const result = await installGrokPluginFromSource({ home, sourceRoot, version })
  return {
    ok: true,
    status: "installed",
    step: "internal_grok_install",
    packageName: "lfg-grok-install",
    pluginRoot: result.pluginRoot,
    installStampPath: result.installStampPath,
    version: result.version,
    exitCode: 0,
    stdout: `internal grok install -> ${result.pluginRoot}`,
    stderr: "",
  }
}

function defaultFixtureSourceRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "grok-install", "fixture-minimal"),
    join(here, "fixture-minimal"),
    join(here, "..", "grok-install", "fixture-minimal"),
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      return path
    }
  }
  return candidates[1]!
}