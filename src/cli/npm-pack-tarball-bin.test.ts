import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import { withNpmPackLock } from "./npm-pack-mutex"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("npm pack tarball package.json (#22)", () => {
  test("packed root package.json exposes bin.lfg not nested workspace package", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "lfg-pack-bin-"))
    try {
      const { stdout } = await withNpmPackLock(() =>
        execFileAsync("npm", ["pack", "--pack-destination", outDir, "--json"], {
          cwd: ROOT,
          encoding: "utf8",
        }),
      )
      const packs = JSON.parse(stdout) as readonly { readonly filename?: string }[]
      const tarball = join(outDir, packs[0]?.filename ?? "")
      const { stdout: tarList } = await execFileAsync("tar", ["-tzf", tarball], { encoding: "utf8" })
      const entries = tarList.split("\n").filter(Boolean)
      expect(entries).toContain("package/bin/lfg.js")
      const { stdout: tarVerbose } = await execFileAsync("tar", ["-tzvf", tarball], { encoding: "utf8" })
      expect(tarVerbose).toMatch(/-rwxr-xr-x.*package\/bin\/lfg\.js/)
      expect(entries).toContain("package/package.json")
      const { stdout: pkgJson } = await execFileAsync("tar", ["-xOf", tarball, "package/package.json"], {
        encoding: "utf8",
      })
      const pkg = JSON.parse(pkgJson) as {
        name?: string
        bin?: { lfg?: string }
        files?: readonly string[]
        publishConfig?: { access?: string }
      }
      expect(pkg.name).toBe("@islee23520/lfg")
      expect(pkg.publishConfig?.access).toBe("public")
      expect(pkg.bin?.lfg).toBe("bin/lfg.js")
      expect(Object.keys(pkg.bin ?? {})).toContain("lfg")
      expect(pkg.files).toContain("bin")
      expect(pkgJson).not.toContain('"lfg": "dist/lfg.js"')
      const desc = (pkg as { description?: string }).description ?? ""
      expect(desc).toContain("grok-install")
      expect(desc).not.toContain("@islee23520/lfp setup")
      expect(pkg.bin).toBeDefined()
      expect((pkg as { workspaces?: unknown }).workspaces).toBeUndefined()
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 60_000)

  test("packed tarball stays allowlisted small layout (#22 not workspace dump)", async () => {
    const { stdout } = await withNpmPackLock(() =>
      execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" }),
    )
    const packs = JSON.parse(stdout) as readonly { readonly files?: readonly { readonly path?: string }[] }[]
    const paths = packs.flatMap((p) => p.files?.map((f) => f.path).filter((x): x is string => typeof x === "string") ?? [])
    expect(paths.length).toBeGreaterThan(5)
    expect(paths.length).toBeLessThanOrEqual(60)
    expect(paths).toContain("package.json")
    expect(paths).not.toContain("src/cli/lfg.ts")
  }, 60_000)
})