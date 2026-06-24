import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import { isLegacyRegistryBinLfg } from "./npm-registry-bin"
import { npmFixtureEnv } from "./npm-pack-mutex"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("registry @islee23520/lfg install smoke (#22)", () => {
  test("0.1.1 without bin fails npx @islee23520/lfg (issue repro)", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-registry-011-"))
    try {
      await execFileAsync("npm", ["init", "-y"], { cwd: installDir, encoding: "utf8", env: npmFixtureEnv() })
      await execFileAsync("npm", ["install", "@islee23520/lfg@0.1.1"], {
        cwd: installDir,
        encoding: "utf8",
        env: npmFixtureEnv(),
        maxBuffer: 4_000_000,
      })
      const pkgPath = join(installDir, "node_modules", "@islee23520", "lfg", "package.json")
      const installed = JSON.parse(await readFile(pkgPath, "utf8")) as { bin?: { lfg?: string } }
      expect(installed.bin).toBeUndefined()
      try {
        await execFileAsync("npx", ["@islee23520/lfg", "--json", "doctor"], {
          cwd: installDir,
          encoding: "utf8",
          env: npmFixtureEnv(),
          maxBuffer: 2_000_000,
        })
        expect.fail("expected npx scoped doctor to fail without bin")
      } catch (error: unknown) {
        const err = error as { stderr?: string; message?: string }
        const combined = `${err.stderr ?? ""}${err.message ?? ""}`
        expect(combined).toMatch(/could not determine executable/i)
      }
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  }, 120_000)

  test("0.1.3 legacy bin.lfg still runs npx doctor; republish needed for shim contract", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-registry-smoke-"))
    try {
      await execFileAsync("npm", ["init", "-y"], { cwd: installDir, encoding: "utf8", env: npmFixtureEnv() })
      await execFileAsync("npm", ["install", "@islee23520/lfg@0.1.3"], {
        cwd: installDir,
        encoding: "utf8",
        env: npmFixtureEnv(),
        maxBuffer: 4_000_000,
      })
      const pkgPath = join(installDir, "node_modules", "@islee23520", "lfg", "package.json")
      const installed = JSON.parse(await readFile(pkgPath, "utf8")) as { bin?: { lfg?: string }; version?: string }
      expect(installed.version).toBe("0.1.3")
      expect(installed.bin?.lfg).toBe("plugins/lfg/dist/lfg.js")
      expect(isLegacyRegistryBinLfg(installed.bin?.lfg)).toBe(true)
      const shimPath = join(installDir, "node_modules", "@islee23520", "lfg", "plugins", "lfg", "lfg")
      await expect(access(shimPath)).rejects.toThrow()
      const distEntry = join(installDir, "node_modules", "@islee23520", "lfg", "plugins", "lfg", "dist", "lfg.js")
      await expect(access(distEntry)).resolves.toBeUndefined()
      const nestedPkg = join(installDir, "node_modules", "@islee23520", "lfg", "plugins", "lfg", "package.json")
      await expect(access(nestedPkg)).resolves.toBeUndefined()
      const nested = JSON.parse(await readFile(nestedPkg, "utf8")) as { bin?: { lfg?: string } }
      expect(nested.bin?.lfg).toBe("dist/lfg.js")

      const localRoot = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
        version: string
        bin?: { lfg?: string }
      }
      expect(localRoot.bin?.lfg).toBe("bin/lfg.js")
      expect(localRoot.version).not.toBe(installed.version)

      const { stdout } = await execFileAsync("npx", ["@islee23520/lfg", "--json", "doctor"], {
        cwd: installDir,
        encoding: "utf8",
        env: npmFixtureEnv(),
        maxBuffer: 2_000_000,
      })
      const doctor = JSON.parse(stdout) as { ok?: boolean; lfgIsPlugin?: boolean }
      expect(doctor.ok).toBe(true)
      // Published package may still carry lfgIsPlugin until next release; local contract is clean.

      const { stdout: setupOut } = await execFileAsync("npx", ["@islee23520/lfg", "--json", "setup"], {
        cwd: installDir,
        encoding: "utf8",
        env: npmFixtureEnv(),
        maxBuffer: 2_000_000,
      })
      const setup = JSON.parse(setupOut) as { ok?: boolean; command?: string; executed?: boolean }
      expect(setup.ok).toBe(true)
      expect(setup.command).toBe("setup")
      expect(setup.executed).toBe(false)
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  }, 120_000)
})
