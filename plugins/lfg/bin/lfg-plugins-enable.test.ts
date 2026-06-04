import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { enableLazycodexPlugin } from "./lfg-plugins-enable"

describe("lfg plugin enable", () => {
  test("appends lazycodex to plugins.enabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(configPath, '[plugins]\nenabled = [\n    "lfg",\n]\n')

    const result = await enableLazycodexPlugin(configPath)

    expect(result).toMatchObject({ ok: true, status: "enabled", executed: true })
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('"lfg"')
    expect(config).toContain('"lazycodex"')
    expect(config.match(/"lazycodex"/g)?.length).toBe(1)
  })

  test("is idempotent when lazycodex is already enabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(configPath, '[plugins]\nenabled = [\n    "lazycodex",\n]\n')

    const result = await enableLazycodexPlugin(configPath)

    expect(result).toMatchObject({ ok: true, status: "already_enabled", executed: false })
    const config = await readFile(configPath, "utf8")
    expect(config.match(/"lazycodex"/g)?.length).toBe(1)
  })
})
