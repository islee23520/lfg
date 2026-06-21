import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("docs/grok-config-endpoints.md (#24)", () => {
  test("documents endpoints.api_key removal and model section keys", async () => {
    const text = await readFile(join(ROOT, "docs/grok-config-endpoints.md"), "utf8")
    expect(text).toContain("endpoints.api_key")
    expect(text).toContain("models_base_url")
    expect(text).toContain("writeGrokModelConfig")
    expect(text).toContain("setup --run")
    expect(text).toContain("--preset multi")
    expect(text).toContain("OPENAI_API_KEY")
    expect(text).not.toMatch(/sk-[a-zA-Z0-9]{10,}/)
  })
})