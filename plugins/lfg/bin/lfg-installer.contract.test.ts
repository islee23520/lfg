import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

describe("lfg-installer config single writer (#29)", () => {
  test("runLazycodexInstaller delegates config.toml to runGrokInstall only", async () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "lfg-installer.ts")
    const src = await readFile(path, "utf8")
    expect(src).not.toContain("writeGrokModelConfig")
    expect(src).toContain("runGrokInstall")
  })
})