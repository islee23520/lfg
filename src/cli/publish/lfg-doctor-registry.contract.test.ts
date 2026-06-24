import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

describe("lfg doctor registry env (#22)", () => {
  test("lfg.ts keeps doctor out of the public setup-only command surface", async () => {
    const path = join(fileURLToPath(new URL("../", import.meta.url)), "command", "lfg.ts")
    const src = await readFile(path, "utf8")
    expect(src).not.toContain("LFG_DOCTOR_REGISTRY_VERSION")
    expect(src).not.toContain("runGrokDoctor")
    expect(src).toContain('command !== "setup"')
    expect(src).toContain('supportedPresets: ["auto", "balanced", "grok", "gpt", "gemini", "glm", "multi"]')
  })
})
