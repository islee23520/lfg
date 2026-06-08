import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("docs/grok-host-auth.md (#23)", () => {
  test("documents mitigations without embedding secrets", async () => {
    const text = await readFile(join(ROOT, "docs/grok-host-auth.md"), "utf8")
    expect(text).toContain("auth.json")
    expect(text).toContain("XAI_API_KEY")
    expect(text).toContain("setup --run")
    expect(text).toContain("grok-config-endpoints.md")
    expect(text).toContain("doctor")
    expect(text).not.toMatch(/sk-[a-zA-Z0-9]{10,}/)
    expect(text).not.toContain("api_key =")
  })
})