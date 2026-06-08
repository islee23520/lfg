import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("npm pack contract (#22)", () => {
  test("dry-run ships bin at root package.json path, not nested plugins/lfg/package.json", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" })
    const packs = JSON.parse(stdout) as readonly { readonly files?: readonly { readonly path?: string }[] }[]
    const paths = packs.flatMap((p) => p.files?.map((f) => f.path).filter((x): x is string => typeof x === "string") ?? [])
    expect(paths).toContain("package.json")
    expect(paths).toContain("plugins/lfg/lfg")
    expect(paths).toContain("plugins/lfg/dist/lfg.js")
    expect(paths).not.toContain("plugins/lfg/package.json")
    expect(paths).not.toContain("plugins/lfg/bin/lfg.ts")
    expect(paths.length).toBeLessThanOrEqual(25)
  })

  test("root package.json bin.lfg points at shim under plugins/lfg", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      readonly bin?: { readonly lfg?: string }
      readonly files?: readonly string[]
    }
    expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg")
    expect(pkg.files).toContain("plugins/lfg/lfg")
    expect(pkg.files).toContain("plugins/lfg/dist")
  })
})