import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths"

describe("resolveGrokAdapterPluginRoot", () => {
  test("prefers lfg over lazycodex when both exist", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-paths-"))
    const lfgRoot = join(home, ".grok", "installed-plugins", "lfg")
    const lazyRoot = join(home, ".grok", "installed-plugins", "lazycodex")
    await mkdir(join(lfgRoot, "components"), { recursive: true })
    await mkdir(join(lazyRoot, "components"), { recursive: true })
    const resolved = await resolveGrokAdapterPluginRoot(home)
    expect(resolved?.pluginDirName).toBe("lfg")
    expect(resolved?.pluginRoot).toBe(lfgRoot)
  })

  test("detects event hooks.json without components", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-hooks-only-"))
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
    await mkdir(join(pluginRoot, "hooks"), { recursive: true })
    await writeFile(
      join(pluginRoot, "hooks", "hooks.json"),
      '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"true"}]}]}}\n',
    )
    const resolved = await resolveGrokAdapterPluginRoot(home)
    expect(resolved?.pluginDirName).toBe("lfg")
  })
})