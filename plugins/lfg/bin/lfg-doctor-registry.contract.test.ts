import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

describe("lfg doctor registry env (#22)", () => {
  test("lfg.ts passes LFG_DOCTOR_REGISTRY_VERSION to runGrokDoctor", async () => {
    const path = join(fileURLToPath(new URL(".", import.meta.url)), "lfg.ts")
    const src = await readFile(path, "utf8")
    expect(src).toContain("LFG_DOCTOR_REGISTRY_VERSION")
    expect(src).toContain("runGrokDoctor")
    expect(src).toContain("registryVersion")
  })
})