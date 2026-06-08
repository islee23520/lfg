import { mkdir, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runGrokDoctor } from "./doctor"

describe("runGrokDoctor missing install", () => {
  test("fails when lazycodex plugin tree absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-doc-miss-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    const json = await runGrokDoctor({ home, moduleUrl: import.meta.url })
    expect(json.ok).toBe(false)
    expect(json.status).toBe("fail")
    expect(json.failedRequired).toContain("grok_install_surface")
  })
})