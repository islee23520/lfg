import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("docs/lfp-capability-port.md", () => {
  test("port map points at grok-install not lfp vendor tree", async () => {
    const text = await readFile(join(ROOT, "docs/lfp-capability-port.md"), "utf8")
    expect(text).toContain("src/grok-adapter/")
    expect(text).toContain("not shipped as-is")
    expect(text).toContain("mirrored")
    expect(text).toContain("vendor tree")
  })
})