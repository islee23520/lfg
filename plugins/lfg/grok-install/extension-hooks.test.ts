import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"

describe("extension-hooks", () => {
  test("merge adds lfg-agent-reminder and keeps visual guidance", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    const result = await mergePortedHooksIntoPlugin(pluginRoot)
    const raw = await readFile(result.path, "utf8")
    const parsed = JSON.parse(raw) as { hooks: readonly { name: string }[] }
    const names = parsed.hooks.map((h) => h.name)
    expect(names).toContain("lfg-visual-guidance")
    expect(names).toContain("lfg-agent-reminder")
    expect(result.hookNames).toEqual(names)
  })
})