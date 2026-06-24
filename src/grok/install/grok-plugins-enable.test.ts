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

  test("disables Grok built-in subagents but keeps LFG agents enabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-preferred-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[subagents.toggle]\ngeneral-purpose = true\nexplore = true\ngrok-build = true\nbuilder = true\n\n[agents]\ndisabled = [\n    "general-purpose",\n    "explore",\n    "grok-build",\n]\n`,
    )

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    expect(text).toContain("general-purpose = false")
    expect(text).toContain("explore = false")
    expect(text).toContain("grok-build = false")
    expect(text).toContain("builder = false")
    expect(text).toContain("sisyphus = true")
    expect(text).toContain("prometheus = true")
    expect(text).toContain("reasoning = true")
    expect(text).toContain("coding = true")
    expect(text).toContain("explorer = true")
    expect(text).toContain("plan = true")
    expect(text).toContain("reviewer = true")
    expect(text).toContain('default = "sisyphus"')
    expect(text).not.toContain('"general-purpose"')
    expect(text).not.toContain('"explore"')
    expect(text).not.toContain('"grok-build"')
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

  test("LFG-owned subagents.models routing writer preserves flat models and adds reasoning effort", async () => {
    const { upsertSubagentModels } = await import("./grok-plugins-enable.ts")
    const mapping = {
      default: "grok-3-mini-fast",
      reasoning: "grok-4.20-0309-reasoning",
      coding: "grok-4.20-0309-non-reasoning",
    }
    const next = upsertSubagentModels(`[subagents.models]\nnon-lfg-key = "user-value"\nreasoning = "old-reasoning"\n`, mapping)

    expect(next).toContain("[subagents.models]")
    expect(next).toContain('plan = "grok-4.20-0309-reasoning"')
    expect(next).toContain('metis = "grok-4.20-0309-reasoning"')
    expect(next).toContain('momus = "grok-4.20-0309-reasoning"')
    expect(next).toContain('reasoning = "grok-4.20-0309-reasoning"')
    expect(next).toContain('explore = "grok-3-mini-fast"')
    expect(next).toContain('explorer = "grok-3-mini-fast"')
    expect(next).toContain('librarian = "grok-3-mini-fast"')
    expect(next).not.toContain('sisyphus = "grok-4.20-0309-reasoning"')
    expect(next).toContain('coding = "grok-4.20-0309-non-reasoning"')
    expect(next).toContain('grok-build = "grok-4.20-0309-non-reasoning"')
    expect(next).toContain('reviewer = "grok-4.20-0309-non-reasoning"')
    expect(next).toContain('non-lfg-key = "user-value"')
    expect(section(next, "subagents.reasoning_effort")).toContain('explorer = "low"')
    expect(section(next, "subagents.reasoning_effort")).toContain('plan = "high"')
    expect(section(next, "subagents.reasoning_effort")).toContain('coding = "medium"')
  })
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}
