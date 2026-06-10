import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import { evaluatePublishGap } from "./publish-readiness"
import { isLegacyRegistryBinLfg, parseNpmRegistryBinLfg } from "./npm-registry-bin"
import { isPublishedLfgBinTarget } from "./npm-publish-bin"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("npm registry version history (#22)", () => {
  test("latest registry semver is behind local and uses publish-contract bin", async () => {
    const local = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      name: string
      version: string
      bin?: { lfg?: string }
    }
    const { stdout: versionsRaw } = await execFileAsync("npm", ["view", local.name, "versions", "--json"], {
      encoding: "utf8",
    })
    const versions = JSON.parse(versionsRaw) as readonly string[]
    expect(versions).toContain("0.1.4")
    expect(versions).not.toContain(local.version)

    const { stdout: latest } = await execFileAsync("npm", ["view", local.name, "version"], { encoding: "utf8" })
    const registryVersion = latest.trim()
    expect(registryVersion).not.toBe(local.version)

    const gap = evaluatePublishGap({
      packageName: local.name,
      localVersion: local.version,
      registryVersion,
      hasBin: isPublishedLfgBinTarget(local.bin?.lfg),
    })
    expect(gap.publishReady).toBe(true)

    const { stdout: binRaw } = await execFileAsync("npm", ["view", `${local.name}@${registryVersion}`, "bin.lfg"], {
      encoding: "utf8",
    })
    const registryBin = parseNpmRegistryBinLfg(binRaw)
    expect(isLegacyRegistryBinLfg(registryBin)).toBe(false)
    expect(isPublishedLfgBinTarget(registryBin)).toBe(true)
  }, 30_000)

  test("0.1.1 on registry had no bin field (#22 could not determine executable)", async () => {
    const { stdout } = await execFileAsync("npm", ["view", "@islee23520/lfg@0.1.1", "bin.lfg"], { encoding: "utf8" })
    expect(parseNpmRegistryBinLfg(stdout)).toBeNull()
    const { stdout: pkgRaw } = await execFileAsync("npm", ["view", "@islee23520/lfg@0.1.1", "--json"], {
      encoding: "utf8",
      maxBuffer: 2_000_000,
    })
    const meta = JSON.parse(pkgRaw) as { bin?: unknown }
    expect(meta.bin).toBeUndefined()
  }, 15_000)
})