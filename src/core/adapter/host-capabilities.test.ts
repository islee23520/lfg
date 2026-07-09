import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { describe, expect, test } from "vitest"
import type { HostAdapterCapabilities } from "./host-capabilities"

const REPO_ROOT = resolve(process.cwd())
const HOST_CAPABILITIES_PATH = join(REPO_ROOT, "src", "core", "adapter", "host-capabilities.ts")

const HOST_SPECIFIC_TOKENS = [
  [".", "grok"].join(""),
  ["src", "grok"].join("/"),
  ["src", "cli"].join("/"),
] as const

describe("host adapter capability interfaces", () => {
  test("describe required host capabilities without host-specific defaults", async () => {
    // Given: a neutral host capability shape compiled against the adapter-facing contract.
    const neutralCapabilities = {
      name: "neutral-host",
      paths: {
        homeDirectory: "/host/home",
        configFile: "/host/home/config.toml",
        pluginDirectory: "/host/home/plugins/lfg",
        hooksFile: "/host/home/hooks/lfg-hooks.json",
      },
      hooks: {
        supportedEvents: ["SessionStart", "PostToolUse"],
      },
      models: {
        discoveryEndpoint: "/models",
        discoveredModels: [{ provider: "provider", id: "model-id", displayName: "Model" }],
      },
      mcp: {
        runtimeRoot: "/host/home/mcp-runtimes",
        servers: [{ name: "codegraph", command: "node", args: ["server.js"] }],
        materializations: [
          {
            name: "codegraph",
            sourceDirectory: "/source/components/codegraph",
            targetDirectory: "/host/home/mcp-runtimes/codegraph",
          },
        ],
      },
      skills: {
        roots: [{ name: "builtin", directory: "/host/home/skills" }],
      },
      agents: {
        promptRoot: "/host/home/prompts",
        installRoot: "/host/home/agents",
      },
    } as const satisfies HostAdapterCapabilities

    // When: the interface module source is inspected as architecture surface.
    const source = await readFile(HOST_CAPABILITIES_PATH, "utf8")

    // Then: it exposes the expected capability groups without Grok or CLI ownership leaks.
    expect(neutralCapabilities.name).toBe("neutral-host")
    for (const token of HOST_SPECIFIC_TOKENS) {
      expect(source).not.toContain(token)
    }
  })
})
