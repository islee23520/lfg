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
    expect(text).toContain("plugins/lfg/bin/")
  })

  test("ADR references npm publish doc for registry surface (#22)", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-ownership.md"), "utf8")
    expect(text).toContain("@islee23520/lfg")
    expect(text).toContain("npx @islee23520/lfg setup")
  })

  test("npm publish doc closes #22 from repository root (#22)", async () => {
    const text = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(text).toContain("repository root")
    expect(text).toContain("closes #22")
    expect(text).toContain("plugins/lfg/lfg")
  })
})