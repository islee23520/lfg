import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { isPublishedLfgBinTarget } from "./npm-publish-bin"
import { evaluatePublishGap } from "./publish-readiness"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

/** #22 — local repo satisfies publish gap when registry is behind (no npm publish in CI). */
describe("publish gap local integration (#22)", () => {
  test("root package.json matches evaluatePublishGap publishReady against 0.1.3", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      name: string
      version: string
      bin?: { lfg?: string }
    }
    const hasBin = isPublishedLfgBinTarget(pkg.bin?.lfg)
    const gap = evaluatePublishGap({
      packageName: pkg.name,
      localVersion: pkg.version,
      registryVersion: "0.1.3",
      hasBin,
    })
    expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg")
    expect(hasBin).toBe(true)
    expect(gap.publishReady).toBe(true)
  })
})