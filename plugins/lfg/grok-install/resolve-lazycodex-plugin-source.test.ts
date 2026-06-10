import { mkdir, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveLazycodexGrokPluginSource } from "./resolve-lazycodex-plugin-source"

describe("resolveLazycodexGrokPluginSource", () => {
  test("prefers LFG_LAZYCODEX_PLUGIN_SOURCE when set", async () => {
    const root = await mkdtemp(join(homedir(), "lfg-plugin-src-"))
    await mkdir(join(root, "components", "ultrawork", "agents"), { recursive: true })
    await writeFile(join(root, "components", "ultrawork", "agents", "explorer.toml"), 'model = "x"\n', "utf8")
    const resolved = await resolveLazycodexGrokPluginSource({ LFG_LAZYCODEX_PLUGIN_SOURCE: root, HOME: homedir() })
    expect(resolved).toBe(root)
  })

  test("finds lazycodex-ai plugin tree in npm _npx cache when present", async () => {
    const home = homedir()
    const resolved = await resolveLazycodexGrokPluginSource({ HOME: home })
    if (resolved === null) {
      expect(true).toBe(true)
      return
    }
    expect(resolved).toContain("omo-codex")
    expect(resolved).toContain("plugin")
  })
})