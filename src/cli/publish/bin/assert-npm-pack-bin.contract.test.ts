import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { PUBLISHED_LFG_BIN_TARGET } from "./npm-publish-bin"

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

describe("scripts/assert-npm-pack-bin.mjs (#22)", () => {
  test("required pack paths include root bin shim and dist entry", async () => {
    const script = await readFile(join(ROOT, "scripts/assert-npm-pack-bin.mjs"), "utf8")
    expect(script).toContain("PUBLISHED_LFG_BIN_TARGET")
    expect(PUBLISHED_LFG_BIN_TARGET).toBe("bin/lfg.js")
    expect(script).toContain("dist/lfg.js")
    expect(script).toContain("bin.lfg")
    expect(script).toContain("bin.lfg must be ${PUBLISHED_LFG_BIN_TARGET}")
    expect(script).toContain("package.json")
    expect(script).toContain("dist/self-test.js")
    expect(script).toContain("publish-readiness.js")
    expect(script).toContain("npm-publish-auth.js")
    expect(script).toContain("npm-registry-version.js")
    expect(script).toContain("npm-publish-bin.js")
    expect(script).toContain("npm-registry-bin.js")
    expect(script).toContain("isPublishedLfgBinTarget")
    expect(script).toContain("fixture/hooks/hooks.json")
    // T5 contract: force package readiness to ship native Grok hooks, bridge fallback asset, OMO parity payloads (failing-first)
    expect(script).toContain("lfg-grok-hook-bridge")
    expect(script).toContain("native Grok")
    expect(script).toContain("bridge fallback")
    expect(script).toContain("Grok-first OMO parity")
  })
})