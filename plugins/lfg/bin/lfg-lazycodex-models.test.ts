import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { discoverLazycodexPluginModels, parseRequiredModelsFromEnv } from "./lfg-lazycodex-models"

describe("lazycodex required models", () => {
  test("discovers models from model-catalog.json and agent toml files", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-adapter."))
    await writeFile(
      join(root, "model-catalog.json"),
      `${JSON.stringify({
        version: "test.catalog",
        current: { model: "gpt-5.5" },
        roles: { default: { model: "gpt-5.5" }, worker: { model: "gpt-5.4" } },
        managedProfiles: [{ match: { model: "gpt-5.2" } }],
      })}\n`,
    )
    const agentsDir = join(root, "components", "ultrawork", "agents")
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, "explorer.toml"), 'model = "gpt-5.4-mini"\n')

    const discovery = await discoverLazycodexPluginModels(root)

    expect(discovery.status).toBe("catalog_and_agents")
    expect(discovery.catalogVersion).toBe("test.catalog")
    expect(discovery.models).toEqual(["gpt-5.4", "gpt-5.4-mini", "gpt-5.5"])
    expect(discovery.modelSources["gpt-5.5"]).toContain("model-catalog.current")
    expect(discovery.modelSources["gpt-5.4-mini"]).toContain("agent:components/ultrawork/agents/explorer.toml")
  })

  test("discovers models from agent toml only when catalog is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-adapter."))
    const agentsDir = join(root, "components", "ultrawork", "agents")
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, "plan.toml"), 'model = "gpt-5.5"\n')

    await expect(discoverLazycodexPluginModels(root)).resolves.toMatchObject({ status: "agents_only", models: ["gpt-5.5"] })
  })

  test("returns none when adapter provides no model metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-adapter."))
    await expect(discoverLazycodexPluginModels(root)).resolves.toMatchObject({ status: "none", models: [] })
  })

  test("parses LFG_GROK_MODELS from environment", () => {
    expect(parseRequiredModelsFromEnv({ LFG_GROK_MODELS: "gpt-5.5,gpt-5.4-mini,gpt-5.2" })).toEqual(["gpt-5.5", "gpt-5.4-mini"])
  })
})
