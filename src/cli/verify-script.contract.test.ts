import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("npm run verify script chain (#22)", () => {
  test("root package.json verify runs assert-pack before test and self-test", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    const verify = pkg.scripts?.verify ?? ""
    expect(verify).toContain("assert-pack")
    expect(verify).toContain("assert-omo-parity")
    expect(verify).toContain("npm test")
    expect(verify).toContain("typecheck")
    expect(verify).toContain("self-test")
    expect(verify.indexOf("assert-pack")).toBeLessThan(verify.indexOf("npm test"))
    expect(verify.indexOf("assert-omo-parity")).toBeLessThan(verify.indexOf("npm test"))
    expect(verify.indexOf("npm test")).toBeLessThan(verify.indexOf("self-test"))
  })

  test("assert-pack and OMO parity scripts invoke release gates (#22)", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.["assert-pack"]).toBe("node scripts/assert-npm-pack-bin.mjs")
    expect(pkg.scripts?.["assert-omo-parity"]).toBe("npm run build && node scripts/assert-omo-parity.mjs")
    expect(pkg.scripts?.prepack).toContain("build")
    expect(pkg.scripts?.prepublishOnly).toBe("npm run verify")
  })
})
