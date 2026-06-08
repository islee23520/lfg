import { mkdtemp, readFile, rm } from "node:fs/promises"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import { isLegacyRegistryBinLfg } from "./npm-registry-bin"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("registry @islee23520/lfg install smoke (#22)", () => {
  test("0.1.3 legacy bin.lfg still runs npx doctor; republish needed for shim contract", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-registry-smoke-"))
    try {
      await execFileAsync("npm", ["init", "-y"], { cwd: installDir, encoding: "utf8" })
      await execFileAsync("npm", ["install", "@islee23520/lfg@0.1.3"], {
        cwd: installDir,
        encoding: "utf8",
        maxBuffer: 4_000_000,
      })
      const pkgPath = join(installDir, "node_modules", "@islee23520", "lfg", "package.json")
      const installed = JSON.parse(await readFile(pkgPath, "utf8")) as { bin?: { lfg?: string }; version?: string }
      expect(installed.version).toBe("0.1.3")
      expect(installed.bin?.lfg).toBe("plugins/lfg/dist/lfg.js")
      expect(isLegacyRegistryBinLfg(installed.bin?.lfg)).toBe(true)

      const localRoot = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
        version: string
        bin?: { lfg?: string }
      }
      expect(localRoot.bin?.lfg).toBe("plugins/lfg/lfg")
      expect(localRoot.version).not.toBe(installed.version)

      const { stdout } = await execFileAsync("npx", ["@islee23520/lfg", "--json", "doctor"], {
        cwd: installDir,
        encoding: "utf8",
        maxBuffer: 2_000_000,
      })
      const doctor = JSON.parse(stdout) as { ok?: boolean; lfgIsPlugin?: boolean }
      expect(doctor.ok).toBe(true)
      expect(doctor.lfgIsPlugin).toBe(false)
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  }, 120_000)
})