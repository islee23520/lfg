import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { ensureLfgAgentsPreferred, ensureLfgPluginsEnabled } from "./grok-plugins-enable"

describe("ensureLfgPluginsEnabled", () => {
  test("keeps lfg as the only enabled plugin", async () => {
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
    expect(text).not.toContain('"other"')
    expect(text).toContain("disabled")
    expect(text).toContain('"user/old"')
  })

  test("strips lfg-owned Grok agent and subagent configuration", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-preferred-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[subagents.toggle]\ngeneral-purpose = false\nexplore = false\ngrok-build = true\nbuilder = true\n\n[subagents.models]\nsisyphus = "old-model"\n\n[subagents.reasoning_effort]\nsisyphus = "high"\n\n[agents]\ndisabled = [\n    "grok-build",\n]\n\n[agent]\nname = "sisyphus"\n`,
    )

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    expect(text).not.toContain("[subagents.toggle]")
    expect(text).not.toContain("[subagents.models]")
    expect(text).not.toContain("[subagents.reasoning_effort]")
    expect(text).not.toContain("[agents]")
    expect(text).not.toContain("[agent]")
    expect(text).not.toContain('"grok-build"')
  })

  test("removes stale sticky ulw without writing an agents table", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-sticky-sisyphus-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(configPath, `[agent]\nname = "ulw"\n`, "utf8")

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    expect(text).not.toContain("[agent]")
    expect(text).not.toContain("[agents]")
  })

  test("preserves user sticky [agent].name when not lfg-owned/stale", async () => {
    const { upsertStickyAgentName, readStickyAgentName } = await import("./grok-plugins-enable.ts")
    const source = `[agent]\nname = "my-custom-agent"\n\n[agents]\ndefault = "sisyphus"\n`
    const next = upsertStickyAgentName(source, "sisyphus")
    expect(readStickyAgentName(next)).toBe("my-custom-agent")
    expect(next).toContain('name = "my-custom-agent"')
  })

  test("does not insert a missing sticky agent and removes lfg-owned stale values", async () => {
    const { upsertStickyAgentName, readStickyAgentName } = await import("./grok-plugins-enable.ts")
    expect(upsertStickyAgentName("", "sisyphus")).toBe("")
    expect(readStickyAgentName(upsertStickyAgentName(`[agent]\nname = "ulw"\n`, "sisyphus"))).toBeNull()
    expect(readStickyAgentName(upsertStickyAgentName(`[agent]\nname = "default"\n`, "sisyphus"))).toBeNull()
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

  test("subagent model cleanup removes the entire retired routing tables", async () => {
    const { upsertSubagentModels } = await import("./grok-plugins-enable.ts")
    const mapping = {
      default: "grok-3-mini-fast",
      reasoning: "grok-4.20-0309-reasoning",
      coding: "grok-4.20-0309-non-reasoning",
    }
    const next = upsertSubagentModels(`[subagents.models]\nnon-lfg-key = "user-value"\nsisyphus = "old-reasoning"\n\n[subagents.reasoning_effort]\nnon-lfg-key = "medium"\nsisyphus = "high"\n`, mapping)

    expect(next).not.toContain("[subagents.models]")
    expect(next).not.toContain("[subagents.reasoning_effort]")
  })
})
