import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("scripts/build.mjs (#22)", () => {
  test("bundles publish-readiness and npm auth helpers into dist", async () => {
    const script = await readFile(join(ROOT, "scripts/build.mjs"), "utf8")
    expect(script).toContain("publish-readiness.ts")
    expect(script).toContain("npm-publish-auth.ts")
    expect(script).toContain("npm-registry-version.ts")
    expect(script).toContain("npm-publish-bin.ts")
    expect(script).toContain("npm-registry-bin.ts")
    expect(script).toContain("fixture")
    expect(script).toContain("includeCache: false")
    expect(script).toContain("lfg-config-loader.mjs")
    expect(script).toContain(".build-")
    expect(script).toContain("rename(fixtureTmp")
    expect(script.indexOf("await acquireBuildLock(buildLockDir)")).toBeGreaterThan(-1)
    expect(script.indexOf("entry.name.startsWith(\"fixture.build-\")")).toBeGreaterThan(
      script.indexOf("await acquireBuildLock(buildLockDir)"),
    )
  })

  test("copies project .omo-aware loader asset into dist", async () => {
    const distLoader = join(ROOT, "dist/grok-install/assets/lfg-config-loader.mjs")
    expect(existsSync(distLoader)).toBe(true)
    const loader = await readFile(distLoader, "utf8")
    expect(loader).toContain("LFG project .omo ledger loaded from")
    expect(loader).toContain("Ledger line count")
  })
})
