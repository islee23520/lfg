import { join } from "node:path"
import { describe, expect, test } from "vitest"

import { buildGrokHostAdapterCapabilities } from "./grok-host-capabilities"

describe("buildGrokHostAdapterCapabilities", () => {
  test("maps Grok install inputs into the neutral host capability contract", () => {
    // Given: a Grok home and discovered model catalog from setup discovery.
    const home = "/tmp/lfg-home"
    const discovery = {
      baseUrl: "http://127.0.0.1:8317/v1",
      modelsUrl: "http://127.0.0.1:8317/v1/models",
      modelIds: ["xai/grok-4", "openai/gpt-5"],
      mapping: {
        default: "xai/grok-4",
        fast: "xai/grok-4",
        reasoning: "openai/gpt-5",
        coding: "xai/grok-4",
      },
    } as const

    // When: the Grok adapter describes its host capabilities.
    const capabilities = buildGrokHostAdapterCapabilities(home, discovery)

    // Then: the contract is populated from Grok-owned paths and discovery.
    expect(capabilities.name).toBe("grok")
    expect(capabilities.paths).toEqual({
      homeDirectory: home,
      configFile: join(home, ".grok", "config.toml"),
      pluginDirectory: join(home, ".grok", "plugins", "lfg"),
      hooksFile: join(home, ".grok", "hooks", "lfg-hooks.json"),
    })
    expect(capabilities.hooks.supportedEvents).toEqual(
      expect.arrayContaining(["SessionStart", "PostToolUse", "SubagentStop"]),
    )
    expect(capabilities.models).toEqual({
      discoveryEndpoint: discovery.modelsUrl,
      discoveredModels: [
        { provider: "xai", id: "xai/grok-4" },
        { provider: "openai", id: "openai/gpt-5" },
      ],
    })
    expect(capabilities.mcp.runtimeRoot).toBe(join(home, ".grok", "plugins", "lfg", "mcp-runtimes"))
    expect(capabilities.mcp.servers.map((server) => server.name)).toEqual(["ast_grep", "git_bash", "lsp", "xai_grok"])
    expect(capabilities.skills.roots).toEqual([
      { name: "plugin", directory: join(home, ".grok", "plugins", "lfg", "skills") },
      { name: "user", directory: join(home, ".grok", "skills") },
    ])
    expect(capabilities.agents).toEqual({
      promptRoot: join(home, ".grok", "prompts", "omo"),
      installRoot: join(home, ".grok", "agents"),
    })
  })
})
