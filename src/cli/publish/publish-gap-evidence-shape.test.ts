import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { isPublishedLfgBinTarget } from "./npm-publish-bin"
import { evaluatePublishGap } from "./publish-readiness"
import { registryBinPublishContract } from "./npm-registry-bin"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

/** #22 — record-publish-gap payload fields match in-repo gap + registryBin helpers. */
describe("publish gap evidence shape (#22)", () => {
  test("record-publish-gap script fields align with evaluatePublishGap output", async () => {
    const script = await readFile(join(ROOT, "scripts/record-publish-gap.mjs"), "utf8")
    expect(script).toContain("evidencePath")
    expect(script).toContain("registryBin")
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      name: string
      version: string
      bin?: { lfg?: string }
    }
    const gap = evaluatePublishGap({
      packageName: pkg.name,
      localVersion: pkg.version,
      registryVersion: "0.1.3",
      hasBin: isPublishedLfgBinTarget(pkg.bin?.lfg),
    })
    const registryBin = registryBinPublishContract("dist/lfg.js")
    const payload = { ...gap, bin: pkg.bin ?? null, registryBin }
    expect(payload.publishReady).toBe(true)
    expect(payload.hasBin).toBe(true)
    expect(payload.bin).toEqual({ lfg: "bin/lfg.js" })
    expect(registryBin.legacyWrongTarget).toBe(true)
    expect(script).toMatch(/publish-gap-\$\{stamp\}/)
  })
})