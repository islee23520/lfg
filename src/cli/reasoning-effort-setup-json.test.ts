import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import type { ModelDiscovery } from "./lfg-models"
import { runLazycodexInstaller } from "./lfg-installer"

describe("setup JSON reasoning effort contract", () => {
  test("surfaces discovered reasoning effort without leaking legacy LFP keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-setup-json-reasoning-"))
    const discovery: ModelDiscovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["grok-3-mini-fast", "gpt-5.5"],
      mapping: {
        default: "gpt-5.5",
        fast: "grok-3-mini-fast",
        reasoning: "gpt-5.5",
        coding: "gpt-5.5",
      },
      modelFeatureMetadata: {
        "gpt-5.5": { reasoningEffort: "xhigh" },
        "grok-3-mini-fast": { reasoningEffort: "low" },
      },
    }
    const previousHome = process.env.HOME
    const previousKey = process.env.OPENAI_API_KEY
    process.env.HOME = home
    process.env.OPENAI_API_KEY = "sk-test"
    try {
      const result = await runLazycodexInstaller(discovery, { force: true })
      const json = JSON.stringify(result)

      expect(result).toMatchObject({
        lfgIsPlugin: false,
        companionPackage: "lfg-grok-install",
        agentReasoning: {
          explorer: "low",
          reasoning: "xhigh",
          coding: "xhigh",
        },
        modelDiscovery: {
          modelFeatureMetadata: {
            "gpt-5.5": { reasoningEffort: "xhigh" },
          },
        },
      })
      expect(json).not.toContain("@islee23520/lfp")
      expect(json).not.toContain("sk-test")
    } finally {
      process.env.HOME = previousHome
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = previousKey
      }
    }
  })
})
