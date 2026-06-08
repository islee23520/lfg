import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("npm publish metadata (#22)", () => {
  test("root package.json has repository and public publishConfig", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      name: string
      publishConfig?: { access?: string }
      repository?: { url?: string }
      bugs?: { url?: string }
    }
    expect(pkg.name).toBe("@islee23520/lfg")
    expect(pkg.publishConfig?.access).toBe("public")
    expect(String(pkg.repository?.url)).toContain("islee23520/lfg")
    expect(String(pkg.bugs?.url)).toContain("issues")
  })

  test("root scripts wire publish-gap evidence recorder (#22)", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.["record-publish-gap"]).toMatch(/^npm run build &&/)
    expect(pkg.scripts?.["record-publish-gap"]).toContain("record-publish-gap.mjs")
    expect(pkg.scripts?.["assert-pack"]).toContain("assert-npm-pack-bin.mjs")
  })
})