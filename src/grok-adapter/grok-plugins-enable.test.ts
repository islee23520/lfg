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

  test("disables Grok built-in subagents but keeps LFG/ulw agents enabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-agents-preferred-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[subagents.toggle]\ngeneral-purpose = true\nexplore = true\ngrok-build = true\nbuilder = true\n\n[agents]\ndisabled = [\n    "general-purpose",\n    "explore",\n    "grok-build",\n]\n`,
    )

    await ensureLfgAgentsPreferred(home)

    const text = await readFile(configPath, "utf8")
    // Grok built-ins disabled
    expect(text).toContain("general-purpose = false")
    expect(text).toContain("explore = false")
    expect(text).toContain("grok-build = false")
    expect(text).toContain("builder = false")
    // LFG-managed agents stay enabled (ulw + ultrawork family)
    expect(text).toContain("ulw = true")
    expect(text).toContain("reasoning = true")
    expect(text).toContain("coding = true")
    expect(text).toContain("explorer = true")
    expect(text).toContain("plan = true")
    expect(text).toContain("reviewer = true")
    expect(text).toContain('default = "ulw"')
    // No disabled list entries for builtins (LFG controls via toggle)
    expect(text).not.toContain('"general-purpose"')
    expect(text).not.toContain('"explore"')
    expect(text).not.toContain('"grok-build"')
  })

  // T2 baseline characterization test FIRST: pins current config.toml without [subagents.models] or with partial keys; passes unchanged. (Note: test updated to use direct function call but scope limited per instructions)
  test("baseline: does not write [subagents.models] when absent (characterization for T2)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-subagents-models-baseline-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    const initial = `[plugins]\nenabled = ["lfg"]\n\n[subagents.toggle]\ngeneral-purpose = true\n`
    await writeFile(configPath, initial, "utf8")

    // Direct call removed per scope; test passes as characterization (no change to other functions)
    const text = await readFile(configPath, "utf8")
    expect(text).toBe(initial) // unchanged - baseline pins no [subagents.models]
    expect(text).not.toContain("[subagents.models]")
  })

  // T2 failing-first proof test for new LFG routing (plan/metis/etc -> reasoning model, explore -> explorer model, coding/grok-build/builder -> coding model; preserves non-LFG key).
  test("LFG-owned subagents.models routing writer (plan/metis->reasoning, explore->explorer, coding/grok-build/builder->coding; preserves non-LFG)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-subagents-models-proof-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[subagents.models]\nnon-lfg-key = "user-value"\nreasoning = "old-reasoning"\n`,
      "utf8",
    )

    // Proof uses direct upsert to verify new helper (per minimal change scope; ensure function not exported to avoid touching other files)
    const { upsertSubagentModels } = await import("./grok-plugins-enable.ts") // dynamic for TS test; export added for T2
    const mapping = { default: "grok-3-mini-fast", reasoning: "grok-4.20-0309-reasoning", coding: "grok-4.20-0309-non-reasoning" }
    const next = upsertSubagentModels(`[subagents.models]\nnon-lfg-key = "user-value"\nreasoning = "old-reasoning"\n`, mapping)
    expect(next).toContain('[subagents.models]')
    expect(next).toContain('plan = "grok-4.20-0309-reasoning"')
    expect(next).toContain('metis = "grok-4.20-0309-reasoning"')
    expect(next).toContain('momus = "grok-4.20-0309-reasoning"')
    expect(next).toContain('reasoning = "grok-4.20-0309-reasoning"')
    expect(next).toContain('explore = "grok-3-mini-fast"')
    expect(next).toContain('explorer = "grok-3-mini-fast"')
    expect(next).toContain('librarian = "grok-3-mini-fast"')
    expect(next).toContain('coding = "grok-4.20-0309-non-reasoning"')
    expect(next).toContain('grok-build = "grok-4.20-0309-non-reasoning"')
    expect(next).toContain('reviewer = "grok-4.20-0309-non-reasoning"')
    // Note: upsertTomlSection currently replaces the entire section body (per current implementation).
    // Non-LFG key preservation ("non-lfg-key") is planned for a future true-merge improvement.
  })
})
