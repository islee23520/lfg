import { access } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const PLUGINS_LFG = fileURLToPath(new URL("../../", import.meta.url))

describe("plan anti-pattern: no src/lfp vendor mirror", () => {
  test("src/lfp directory must not exist", async () => {
    const lfpDir = join(PLUGINS_LFG, "lfp")
    let exists = true
    try {
      await access(lfpDir)
    } catch {
      exists = false
    }
    expect(exists).toBe(false)
  })
})