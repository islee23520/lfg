import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { dispatchUninstallCommand } from "./uninstall-command"
import { runLfg } from "../test/test-process"

const tempHomes: string[] = []

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("uninstall command", () => {
  test("plans without deleting when yes is absent", async () => {
    const home = await makeTempHome()
    const plugin = join(home, ".grok", "plugins", "lfg")
    await mkdir(plugin, { recursive: true })

    const result = await dispatchUninstallCommand({ home, argv: [] })

    expect(result.status).toBe("uninstall_planned")
    expect(result.dryRun).toBe(true)
    expect(result.paths.find((item) => item.path === plugin)?.exists).toBe(true)
    expect((await stat(plugin)).isDirectory()).toBe(true)
  })

  test("removes exact owned surfaces while preserving unrelated Grok state", async () => {
    const home = await makeTempHome()
    const grok = join(home, ".grok")
    const ownedPrompt = join(grok, "prompts", "omo", "sisyphus.md")
    const unrelatedPrompt = join(grok, "prompts", "omo", "librarian.md")
    const ownedAgent = join(grok, "agents", "sisyphus.md")
    const unrelatedAgent = join(grok, "agents", "librarian.md")
    await mkdir(join(grok, "plugins", "lfg"), { recursive: true })
    await mkdir(join(grok, "bin"), { recursive: true })
    await mkdir(join(grok, "prompts", "omo"), { recursive: true })
    await mkdir(join(grok, "agents"), { recursive: true })
    await Promise.all([
      writeFile(join(grok, "bin", "lfg"), "lfg"),
      writeFile(join(grok, "bin", "grok"), "grok"),
      writeFile(join(grok, "auth.json"), "{}"),
      writeFile(ownedPrompt, "owned"),
      writeFile(unrelatedPrompt, "user"),
      writeFile(ownedAgent, "owned"),
      writeFile(unrelatedAgent, "user"),
      writeFile(join(grok, "omo-agent-overrides.json"), "{}"),
      writeFile(join(grok, "config.toml"), configFixture()),
    ])

    const result = await dispatchUninstallCommand({ home, argv: ["--yes"] })

    expect(result.status).toBe("uninstalled")
    expect(result.removed).toContain(ownedPrompt)
    expect(result.removed).toContain(ownedAgent)
    expect(await readFile(unrelatedPrompt, "utf8")).toBe("user")
    expect(await readFile(unrelatedAgent, "utf8")).toBe("user")
    expect(await readFile(join(grok, "bin", "grok"), "utf8")).toBe("grok")
    expect(await readFile(join(grok, "auth.json"), "utf8")).toBe("{}")
    const config = await readFile(join(grok, "config.toml"), "utf8")
    expect(config).not.toContain("[omo.models]")
    expect(config).not.toContain("[lazycodex.agents]")
    expect(config).not.toContain("models_base_url")
    expect(config).not.toContain("[model.user-owned]")
    expect(config).toContain("[subagents.user-owned]")
    expect(config).toContain("other = \"safe\"")
    expect(config).toContain("[user]")
  })

  test("routes uninstall planning through the built CLI and isolated Grok home", async () => {
    const home = await makeTempHome()
    const plugin = join(home, ".grok", "plugins", "lfg")
    await mkdir(plugin, { recursive: true })

    const result = await runLfg(["--json", "uninstall"], {
      LFG_ALLOW_TEST_GROK_HOME: "1",
      LFG_TEST_GROK_HOME: home,
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ status: "uninstall_planned", dryRun: true, lfgIsPlugin: false })
    expect((await stat(plugin)).isDirectory()).toBe(true)
  })
})

async function makeTempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "lfg-uninstall-"))
  tempHomes.push(home)
  return home
}

function configFixture(): string {
  return [
    "[endpoints]", "models_base_url = \"http://owned\"", "other = \"safe\"", "",
    "[models]", "default = \"owned\"", "", "[omo.models]", "default = \"owned\"", "",
    "[lazycodex.agents]", "enabled = true", "", "[model.user-owned]", "name = \"safe\"", "",
    "[subagents.user-owned]", "model = \"safe\"", "", "[user]", "name = \"kept\"", "",
  ].join("\n")
}
