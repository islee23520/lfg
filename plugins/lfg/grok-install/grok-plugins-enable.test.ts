import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled } from "./grok-plugins-enable"

describe("ensureLfgPluginsEnabled", () => {
  test("appends lfg and lazycodex without dropping disabled list", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-plugins-enable-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[plugins]\nenabled = [\n    "other",\n]\ndisabled = [\n    "user/old",\n]\n`,
    )
    await ensureLfgPluginsEnabled(home)
    const text = await readFile(configPath, "utf8")
    expect(text).toContain('"lfg"')
    expect(text).toContain('"lazycodex"')
    expect(text).toContain('"other"')
    expect(text).toContain("disabled")
    expect(text).toContain('"user/old"')
  })

  test("prefers LFG shadowed built-ins and ULW default agent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-preferred-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[subagents.toggle]\ngeneral-purpose = false\nexplore = false\ngrok-build = false\n\n[agents]\ndisabled = [\n    "general-purpose",\n    "explore",\n    "grok-build",\n]\n`,
    )

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    expect(text).toContain("general-purpose = true")
    expect(text).toContain("explore = true")
    expect(text).toContain("grok-build = true")
    expect(text).toContain("builder = true")
    expect(text).toContain("ulw = true")
    expect(text).toContain('default = "ulw"')
    expect(text).not.toContain('"general-purpose"')
    expect(text).not.toContain('"explore"')
    expect(text).not.toContain('"grok-build"')
  })
})
