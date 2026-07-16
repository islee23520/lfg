import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "../../cli/models/lfg-models"
import { runGrokInstall } from "./run-grok-install"

describe("reasoning effort propagation", () => {
  test("auto reasoning effort persists only the sisyphus default", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-reasoning-effort-"))
    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["grok-3-mini-fast", "gpt-5.5", "codex-auto-review"],
      mapping: {
        default: "gpt-5.5",
        fast: "grok-3-mini-fast",
        reasoning: "gpt-5.5",
        coding: "codex-auto-review",
      },
      modelFeatureMetadata: {
        "grok-3-mini-fast": { reasoningEffort: "low" },
        "gpt-5.5": { reasoningEffort: "xhigh" },
        "codex-auto-review": { reasoningEffort: "high" },
      },
    }

    const run = await runGrokInstall(discovery, { HOME: home, OPENAI_API_KEY: "sk-test" })

    expect(run.ok).toBe(true)
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).resolves.toContain('"reasoning_level": "medium"')
    await expect(readFile(join(home, ".grok", "roles", "sisyphus.toml"), "utf8")).resolves.toContain('reasoning_effort = "medium"')
    await expect(readFile(join(home, ".grok", "roles", "reasoning.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "config.toml"), "utf8")).resolves.not.toContain("reasoning_effort")
  })
})
