import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { evaluatePublishGap } from "./publish-readiness"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("npm publish workflow (#22)", () => {
  test("root package.json version and bin satisfy evaluatePublishGap ahead of registry", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      name: string
      version: string
      bin?: { lfg?: string }
    }
    expect(pkg.name).toBe("@islee23520/lfg")
    expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg")
    const gap = evaluatePublishGap({
      packageName: pkg.name,
      localVersion: pkg.version,
      registryVersion: "0.1.3",
      hasBin: Boolean(pkg.bin?.lfg),
    })
    expect(gap.publishReady).toBe(true)
    expect(gap.localVersion).toBe(pkg.version)
  })

  test("pre-publish-check script exists on root package", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.["pre-publish-check"]).toContain("pre-publish-check.mjs")
    expect(pkg.scripts?.verify).toContain("assert-pack")
  })
})