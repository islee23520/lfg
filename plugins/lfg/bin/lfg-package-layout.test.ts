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
})