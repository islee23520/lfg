import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = process.cwd()

describe("npm publish gates (#22)", () => {
  test("prepublishOnly runs the full verify gate; no postinstall hook on root package", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.prepublishOnly).toBe("npm run verify")
    expect(pkg.scripts?.prepack).toContain("build")
    expect(pkg.scripts).not.toHaveProperty("postinstall")
  })

  test("verify chains assert-pack and OMO parity before test (#22)", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    const verify = pkg.scripts?.verify ?? ""
    expect(verify).toBe("npm run assert-pack && npm run assert-omo-parity && npm test && npm run typecheck && npm run self-test")
  })

  test("scoped package name matches evaluatePublishGap default", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { name: string }
    expect(pkg.name).toBe("@islee23520/lfg")
  })

  test("root files allowlist publishes bin shim and dist, with package.json included by npm", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      readonly bin?: { readonly lfg?: string }
      readonly files?: readonly string[]
    }
    expect(pkg.bin?.lfg).toBe("bin/lfg.js")
    expect(pkg.files).toEqual(["bin", "dist", "skills", "README.md", "AGENTS.md", "src/AGENTS.md"])
  })
})
