import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("npm publish gates (#22)", () => {
  test("prepublishOnly runs npm test; no postinstall hook on root package", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.prepublishOnly).toBe("npm test")
    expect(pkg.scripts?.prepack).toContain("build")
    expect(pkg.scripts).not.toHaveProperty("postinstall")
  })

  test("scoped package name matches evaluatePublishGap default", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { name: string }
    expect(pkg.name).toBe("@islee23520/lfg")
  })
})