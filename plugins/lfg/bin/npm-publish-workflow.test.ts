import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { isPublishedLfgBinTarget } from "./npm-publish-bin"
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
    expect(isPublishedLfgBinTarget(pkg.bin?.lfg)).toBe(true)
    const gap = evaluatePublishGap({
      packageName: pkg.name,
      localVersion: pkg.version,
      registryVersion: "0.1.3",
      hasBin: isPublishedLfgBinTarget(pkg.bin?.lfg),
    })
    expect(gap.publishReady).toBe(true)
    expect(gap.localVersion).toBe(pkg.version)
  })

  test("pre-publish-check script exists on root package", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.verify).toContain("assert-pack")
    expect(pkg.scripts?.["pre-publish-check"]).toContain("pre-publish-check.mjs")
  })
})