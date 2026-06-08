import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("npm pack tarball package.json (#22)", () => {
  test("packed root package.json exposes bin.lfg not nested workspace package", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "lfg-pack-bin-"))
    try {
      const { stdout } = await execFileAsync("npm", ["pack", "--pack-destination", outDir, "--json"], {
        cwd: ROOT,
        encoding: "utf8",
      })
      const packs = JSON.parse(stdout) as readonly { readonly filename?: string }[]
      const tarball = join(outDir, packs[0]?.filename ?? "")
      const { stdout: pkgJson } = await execFileAsync("tar", ["-xOf", tarball, "package/package.json"], {
        encoding: "utf8",
      })
      const pkg = JSON.parse(pkgJson) as { name?: string; bin?: { lfg?: string }; files?: readonly string[] }
      expect(pkg.name).toBe("@islee23520/lfg")
      expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg")
      expect(pkg.files).toContain("plugins/lfg/lfg")
      expect(pkgJson).not.toContain('"lfg": "dist/lfg.js"')
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 60_000)
})