import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/npm-publish.md (#22)", () => {
  test("documents assert-pack, assert-publish-auth, and repo-root publish", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("assert-publish-auth")
    expect(doc).toContain("pre-publish-check")
    expect(doc).toContain("repository root")
    expect(doc).toContain("bin/lfg.js")
    expect(doc).toContain("assert-pack")
    expect(doc).toContain("OMO parity")
    expect(doc).toContain("prepack")
    expect(doc).toContain("dist/lfg.js")
    expect(doc).toContain("closes #22")
    expect(doc).toContain("non-mutating JSON plan")
    expect(doc).toContain("registryBin")
    expect(doc).toContain("registry-install-smoke")
    expect(doc).toContain("0.1.3")
    expect(doc).toContain("could not determine executable")
    expect(doc).toContain("files")
    expect(doc).toContain("no nested workspace publish surface")
    expect(doc).toContain("@latest")
  })

  test("documents the tag-driven automation flow", async () => {
    const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(doc).toContain("lfg.yml")
    expect(doc).toContain("NPM_TOKEN")
    expect(doc).toContain("npm version")
    expect(doc).toContain("--follow-tags")
    expect(doc).toContain("refs/tags/v")
    expect(doc).toContain("GitHub Release")
  })
})
