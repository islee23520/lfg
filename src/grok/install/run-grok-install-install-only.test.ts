import { access, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "../../cli/models/lfg-models"
import { runGrokInstall } from "./run-grok-install"

describe("runGrokInstall install-only", () => {
  test("refreshes plugin payload without writing model config or agent overrides", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-install-only-"))
    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-5.5", "gpt-5.4-mini-fast"],
      mapping: { default: "gpt-5.5", fast: "gpt-5.4-mini-fast", reasoning: "gpt-5.5", coding: "gpt-5.5" },
    }

    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" }, { installOnly: true })

    expect(run.ok).toBe(true)
    expect(run.configUpdate).toBeNull()
    expect(run.omoAgents).toBeNull()
    expect(run.agentOverridesPath).toBeNull()
    await expect(access(join(home, ".grok", "plugins", "lfg", "lfg-install.json"))).resolves.toBeUndefined()
    // install-only may write MCP registration (xai_grok) but not agent overrides / model discovery routes.
    try {
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(config).not.toMatch(/\[omo\.agents\./)
      expect(config).not.toMatch(/\[subagents\.models\]/)
      expect(config).not.toMatch(/\bgpt-5\.5\b/)
    } catch (error) {
      expect(error).toMatchObject({ code: "ENOENT" })
    }
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "lazycodex-agent-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})
