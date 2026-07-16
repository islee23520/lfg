import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runGrokInstall } from "./run-grok-install"

const NATIVE_AGENTS = ["sisyphus"] as const
const RETIRED_DEFAULT_AGENTS = ["default", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "metis", "momus", "multimodal-looker", "sisyphus-junior", "lazycodex", "lazycodex-worker-low", "lazycodex-worker-medium", "lazycodex-worker-high", "watcher", "explorer", "git-master"] as const

describe("runGrokInstall slim default agent surfaces", () => {
  test("materializes only sisyphus and removes retired subagent surfaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-slim-agents-"))
    const userAgentsDir = join(home, ".grok", "agents")
    await mkdir(userAgentsDir, { recursive: true })
    await writeFile(join(userAgentsDir, "default.md"), "stale host default agent\n", "utf8")
    await writeFile(join(userAgentsDir, "lazycodex.md"), "stale handoff facade\n", "utf8")
    await mkdir(join(home, ".grok", "plugins", "lfg", "agents"), { recursive: true })
    await writeFile(join(home, ".grok", "plugins", "lfg", "agents", "lazycodex.md"), "stale plugin agent\n", "utf8")
    await mkdir(join(home, ".grok", "roles"), { recursive: true })
    await writeFile(join(home, ".grok", "roles", "lazycodex.toml"), "name = \"lazycodex\"\n", "utf8")
    await mkdir(join(home, ".grok", "personas"), { recursive: true })
    await writeFile(join(home, ".grok", "personas", "lazycodex.toml"), "name = \"lazycodex\"\n", "utf8")
    await mkdir(join(home, ".grok", "prompts", "omo"), { recursive: true })
    await writeFile(join(home, ".grok", "prompts", "omo", "lazycodex.md"), "stale prompt\n", "utf8")
    await writeFile(join(home, ".grok", "config.toml"), `[agent]\nname = "ulw"\n`, "utf8")

    const run = await runGrokInstall(null, { HOME: home })
    expect(run.ok).toBe(true)

    const overrides = JSON.parse(await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")) as { overrides: Record<string, unknown> }
    expect(Object.keys(overrides.overrides).sort()).toEqual([...NATIVE_AGENTS].sort())

    const configToml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(configToml).not.toContain("[agent]")
    expect(configToml).not.toContain("[agents]")
    expect(configToml).not.toContain("[subagents.")
    await expect(readFile(join(userAgentsDir, "default.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "agents-user-backup-lfg", "default.md"), "utf8")).resolves.toBe("stale host default agent\n")

    for (const name of NATIVE_AGENTS) {
      await expect(readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")).resolves.toMatch(/model\s*=/)
      await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", `${name}.md`), "utf8")).resolves.toContain(`name: ${name}`)
      await expect(readFile(join(home, ".grok", "prompts", "omo", `${name}.md`), "utf8")).resolves.toMatch(/\S/)
    }

    for (const name of RETIRED_DEFAULT_AGENTS) {
      await expect(readFile(join(home, ".grok", "roles", `${name}.toml`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(home, ".grok", "personas", `${name}.toml`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", `${name}.md`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(home, ".grok", "prompts", "omo", `${name}.md`), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    }
    await expect(readFile(join(userAgentsDir, "lazycodex.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "hooks", "lfg-native-lazycodex-auto-monitor.mjs"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "hooks", "hooks.source.json"), "utf8")).resolves.not.toContain("lazycodex-auto-monitor")
  })
})
