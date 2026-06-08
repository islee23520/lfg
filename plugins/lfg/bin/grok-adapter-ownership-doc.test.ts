import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("docs/grok-adapter-ownership.md", () => {
  test("ADR states lfgIsPlugin false and no default lfp setup", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-ownership.md"), "utf8")
    expect(text).toContain("lfgIsPlugin: false")
    expect(text).toContain("npx @islee23520/lfg setup")
    expect(text).toContain("copy-paste vendor")
    expect(text.toLowerCase()).not.toContain("linalab product")
  })
})