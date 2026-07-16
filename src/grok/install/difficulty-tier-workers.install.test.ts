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
  test("null discovery removes host difficulty-tier worker surfaces", async () => {
    // Given: a fresh temp Grok home and null discovery (bundled OMO defaults).
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-difficulty-tier-workers-"))

    // When: setup materializes the default agent ledger.
    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)

    const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
    for (const name of DIFFICULTY_TIER_WORKERS) {
      await expect(readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", `${name}.md`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(home, ".grok", "prompts", "omo", `${name}.md`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      expect(overridesRaw).not.toContain(`"${name}"`)
    }
  })

  test("repeated preserve setup strips leftover subagent model tables", async () => {
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

    const after = await readFile(userConfigPath, "utf8")
    expect(after).not.toContain("[subagents.models]")
    for (const name of DIFFICULTY_TIER_WORKERS) {
      await expect(readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    }
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).resolves.not.toContain('"lazycodex-worker-high"')
  })
})
