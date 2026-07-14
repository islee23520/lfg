import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runGrokInstall } from "./run-grok-install"

const DIFFICULTY_TIER_WORKERS = [
  "lazycodex-worker-low",
  "lazycodex-worker-medium",
  "lazycodex-worker-high",
] as const


describe("difficulty-tier worker install surfaces", () => {
  test("null discovery writes difficulty-tier worker roles, agents, prompts, and model fields", async () => {
    // Given: a fresh temp Grok home and null discovery (bundled OMO defaults).
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-difficulty-tier-workers-"))

    // When: setup materializes the default agent ledger.
    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)

    // Then: each tier worker has role TOML, plugin agent md, omo prompt, and override fields.
    // Canonical shipped contract: { version, overrides: { [agentName]: { model, reasoning_level, ... } } }.
    const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
    const overridesFile = JSON.parse(overridesRaw) as {
      readonly version?: number
      readonly overrides?: Readonly<
        Record<
          string,
          {
            readonly model?: string
            readonly reasoning_level?: string
            readonly model_fallback?: string
            readonly reasoningLevel?: string
            readonly modelFallback?: string
          }
        >
      >
    }
    expect(overridesFile.version).toBe(1)
    expect(overridesFile.overrides).toBeTruthy()
    const overrides = overridesFile.overrides ?? {}

    for (const name of DIFFICULTY_TIER_WORKERS) {
      const role = await readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")
      expect(role).toContain("model =")
      expect(role).toContain("reasoning_effort")
      expect(role).toMatch(/prompt_file\s*=/)

      const pluginAgent = await readFile(join(home, ".grok", "plugins", "lfg", "agents", `${name}.md`), "utf8")
      expect(pluginAgent).toContain(`name: ${name}`)

      const prompt = await readFile(join(home, ".grok", "prompts", "omo", `${name}.md`), "utf8")
      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).toMatch(/worker|difficulty|implementation/i)

      expect(overridesRaw).toContain(`"${name}"`)
      const entry = overrides[name]
      expect(entry, name).toBeTruthy()
      const model = entry.model
      const reasoning = entry.reasoning_level ?? entry.reasoningLevel
      const fallback = entry.model_fallback ?? entry.modelFallback
      expect(typeof model, `${name}.model`).toBe("string")
      expect(String(model).length).toBeGreaterThan(0)
      expect(typeof reasoning, `${name}.reasoning`).toBe("string")
      expect(String(reasoning).length).toBeGreaterThan(0)
      expect(typeof fallback, `${name}.model_fallback`).toBe("string")
      expect(String(fallback).length).toBeGreaterThan(0)
    }

    // Tier-aligned defaults: low=fast/low, medium=coding/medium, high=reasoning/high.
    const lowRole = await readFile(join(home, ".grok", "roles", "lazycodex-worker-low.toml"), "utf8")
    expect(lowRole).toMatch(/model\s*=\s*"(grok-3-mini-fast|[^"]*fast[^"]*)"/i)
    expect(lowRole).toContain('reasoning_effort = "low"')

    const mediumRole = await readFile(join(home, ".grok", "roles", "lazycodex-worker-medium.toml"), "utf8")
    expect(mediumRole).toContain("model =")
    expect(mediumRole).toContain('reasoning_effort = "medium"')

    const highRole = await readFile(join(home, ".grok", "roles", "lazycodex-worker-high.toml"), "utf8")
    expect(highRole).toContain("model =")
    expect(highRole).toContain('reasoning_effort = "high"')
  })

  test("difficulty-tier workers survive fresh install then repeated preserve setup and keep user-owned config.toml key", async () => {
    // Given: a fresh install that materializes tier workers, then a user-owned config.toml key.
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-difficulty-tier-preserve-"))
    const first = await runGrokInstall(null, { HOME: home })
    expect(first.ok).toBe(true)

    const userConfigPath = join(home, ".grok", "config.toml")
    const before = await readFile(userConfigPath, "utf8")
    // Non-lfg-owned subagents.models key is preserved across rewrites (mergeSubagentModelBody).
    const withUserKey = before.includes("[subagents.models]")
      ? before.replace("[subagents.models]\n", '[subagents.models]\nuser-owned-tier-key = "keep-me"\n')
      : `${before}\n[subagents.models]\nuser-owned-tier-key = "keep-me"\n`
    await writeFile(userConfigPath, withUserKey, "utf8")

    // When: setup is re-run without --force (preserve / already_installed path).
    const second = await runGrokInstall(null, { HOME: home })
    expect(second.ok).toBe(true)

    // Then: all three worker surfaces remain, and the user-owned key is still present.
    const after = await readFile(userConfigPath, "utf8")
    expect(after).toContain('user-owned-tier-key = "keep-me"')
    for (const name of DIFFICULTY_TIER_WORKERS) {
      await expect(readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")).resolves.toContain("model =")
      await expect(
        readFile(join(home, ".grok", "plugins", "lfg", "agents", `${name}.md`), "utf8"),
      ).resolves.toContain(`name: ${name}`)
      await expect(readFile(join(home, ".grok", "prompts", "omo", `${name}.md`), "utf8")).resolves.toMatch(
        /worker|difficulty|implementation/i,
      )
    }
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).resolves.toContain(
      '"lazycodex-worker-high"',
    )
  })
})
