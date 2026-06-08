import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { resolveLfgCliLayout } from "./lfg-package-layout"

describe("lfg-package-layout", () => {
  test("published workspace layout resolves from dist/lfg.js", async () => {
    const moduleUrl = new URL("../dist/lfg.js", import.meta.url).href
    const layout = await resolveLfgCliLayout(moduleUrl)
    expect(layout.ok).toBe(true)
    expect(layout.layout).toBe("published-workspace")
    expect(layout.distEntry).toContain("dist/lfg.js")
    expect(layout.packageRoot).not.toBeNull()
  })

  test("dev bin entry resolves via sibling dist", async () => {
    const moduleUrl = new URL("./lfg.ts", import.meta.url).href
    const layout = await resolveLfgCliLayout(moduleUrl)
    expect(layout.ok).toBe(true)
    expect(layout.layout).toBe("workspace-dev")
    expect(layout.distEntry).toContain("dist/lfg.js")
  })

  test("npm install layout: root package.json with bin, no nested plugins/lfg/package.json (#22)", async () => {
    const installRoot = await mkdtemp(join(tmpdir(), "lfg-npm-layout-"))
    try {
      const distPath = join(installRoot, "plugins/lfg/dist/lfg.js")
      await mkdir(join(installRoot, "plugins/lfg/dist"), { recursive: true })
      await writeFile(
        join(installRoot, "package.json"),
        `${JSON.stringify({ name: "@islee23520/lfg", bin: { lfg: "plugins/lfg/lfg" } })}\n`,
      )
      await writeFile(distPath, "export {}\n")
      const layout = await resolveLfgCliLayout(pathToFileURL(distPath).href)
      expect(layout.ok).toBe(true)
      expect(layout.layout).toBe("published-workspace")
      expect(layout.packageRoot).toBe(installRoot)
    } finally {
      await rm(installRoot, { recursive: true, force: true })
    }
  })

  test("publish root without bin.lfg is not published-workspace (#22)", async () => {
    const installRoot = await mkdtemp(join(tmpdir(), "lfg-nobin-layout-"))
    try {
      await mkdir(join(installRoot, "plugins/lfg/dist"), { recursive: true })
      await writeFile(join(installRoot, "package.json"), `${JSON.stringify({ name: "@islee23520/lfg", version: "0.1.1" })}\n`)
      const distPath = join(installRoot, "plugins/lfg/dist/lfg.js")
      await writeFile(distPath, "export {}\n")
      const layout = await resolveLfgCliLayout(pathToFileURL(distPath).href)
      expect(layout.layout).not.toBe("published-workspace")
      expect(layout.ok).toBe(false)
    } finally {
      await rm(installRoot, { recursive: true, force: true })
    }
  })
})