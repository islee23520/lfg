import { access, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "../cli/lfg-models"
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
    expect(run.lazycodexAgents).toBeNull()
    expect(run.agentOverridesPath).toBeNull()
    await expect(access(join(home, ".grok", "plugins", "lfg", "lfg-install.json"))).resolves.toBeUndefined()
    await expect(readFile(join(home, ".grok", "config.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "lazycodex-agent-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})
