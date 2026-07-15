import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled } from "./grok-plugins-enable"

describe("ensureLfgPluginsEnabled", () => {
  test("appends lfg without re-enabling retired lazycodex or dropping disabled list", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-plugins-enable-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[plugins]\nenabled = [\n    "other",\n    "lazycodex",\n]\ndisabled = [\n    "user/old",\n]\n`,
    )
    await ensureLfgPluginsEnabled(home)
    const text = await readFile(configPath, "utf8")
    expect(text).toContain('"lfg"')
    expect(text).not.toContain('"lazycodex"')
    expect(text).toContain('"other"')
    expect(text).toContain("disabled")
    expect(text).toContain('"user/old"')
  })

  test("prefers slim native agents including git-master", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-preferred-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[subagents.toggle]\ngeneral-purpose = false\nexplore = false\ngrok-build = true\nbuilder = true\n\n[agents]\ndisabled = [\n    "grok-build",\n]\n`,
    )

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    expect(text).toContain("general-purpose = false")
    expect(text).toContain("explore = false")
    expect(text).toContain("grok-build = false")
    expect(text).toContain("builder = false")
    expect(text).toContain("sisyphus = true")
    expect(text).toContain("watcher = true")
    expect(text).toContain("lazycodex = false")
    expect(text).toContain("explorer = true")
    expect(text).toContain("git-master = true")
    expect(text).toContain('default = "sisyphus"')
    expect(text).toMatch(/\[agent\]\s*\nname\s*=\s*"sisyphus"/)
    expect(text).not.toContain('"grok-build"')
  })

  test("forces stale sticky ulw to sisyphus and disables the host default agent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-sticky-sisyphus-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(configPath, `[agent]\nname = "ulw"\n`, "utf8")

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    expect(text).toContain('default = "sisyphus"')
    expect(text).toMatch(/\[agent\]\s*\nname\s*=\s*"sisyphus"/)
    expect(text).toMatch(/disabled\s*=\s*\[[\s\S]*?"default"[\s\S]*?\]/)
  })

  test("preserves user sticky [agent].name when not lfg-owned/stale", async () => {
    const { upsertStickyAgentName, readStickyAgentName } = await import("./grok-plugins-enable.ts")
    const source = `[agent]\nname = "my-custom-agent"\n\n[agents]\ndefault = "sisyphus"\n`
    const next = upsertStickyAgentName(source, "sisyphus")
    expect(readStickyAgentName(next)).toBe("my-custom-agent")
    expect(next).toContain('name = "my-custom-agent"')
  })

  test("replaces missing or stale sticky [agent].name with sisyphus", async () => {
    const { upsertStickyAgentName, readStickyAgentName } = await import("./grok-plugins-enable.ts")
    expect(readStickyAgentName(upsertStickyAgentName("", "sisyphus"))).toBe("sisyphus")
    expect(readStickyAgentName(upsertStickyAgentName(`[agent]\nname = "ulw"\n`, "sisyphus"))).toBe("sisyphus")
    expect(readStickyAgentName(upsertStickyAgentName(`[agent]\nname = "default"\n`, "sisyphus"))).toBe("sisyphus")
  })

  test("baseline: does not write [subagents.models] when absent (characterization for T2)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-subagents-models-baseline-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    const initial = `[plugins]\nenabled = ["lfg"]\n\n[subagents.toggle]\ngeneral-purpose = true\n`
    await writeFile(configPath, initial, "utf8")

    const text = await readFile(configPath, "utf8")
    expect(text).toBe(initial)
    expect(text).not.toContain("[subagents.models]")
  })

  test("subagent model cleanup preserves user keys and removes LFG-owned routing", async () => {
    const { upsertSubagentModels } = await import("./grok-plugins-enable.ts")
    const mapping = {
      default: "grok-3-mini-fast",
      reasoning: "grok-4.20-0309-reasoning",
      coding: "grok-4.20-0309-non-reasoning",
    }
    const next = upsertSubagentModels(`[subagents.models]\nnon-lfg-key = "user-value"\nsisyphus = "old-reasoning"\n\n[subagents.reasoning_effort]\nnon-lfg-key = "medium"\nsisyphus = "high"\n`, mapping)

    expect(next).toContain("[subagents.models]")
    expect(next).toContain('non-lfg-key = "user-value"')
    expect(next).not.toContain("sisyphus =")
    expect(section(next, "subagents.reasoning_effort")).toContain('non-lfg-key = "medium"')
  })
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}
