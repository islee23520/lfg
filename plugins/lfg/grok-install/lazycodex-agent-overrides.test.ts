import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../bin/lfg-models"
import {
  CONFIGURABLE_LAZYCODEX_AGENT_NAMES,
  loadBundledDefaultOmoOverrides,
  mergeLazycodexAgentOverrides,
  readLazycodexAgentOverridesFile,
  writeLazycodexAgentOverridesFile,
} from "./lazycodex-agent-overrides"

const discovery: ModelDiscovery = {
  baseUrl: "http://127.0.0.1/v1",
  modelsUrl: "http://127.0.0.1/v1/models",
  modelIds: ["gpt-4.1-mini", "o3-mini"],
  mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "o3-mini", coding: "gpt-4.1-mini" },
}

describe("lazycodex-agent-overrides", () => {
  test("writes and reads per-agent override file", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-override-file-"))
    await writeLazycodexAgentOverridesFile(home, {
      librarian: { model: "gpt-5.4-mini", reasoningLevel: "low" },
      explorer: { model: "gpt-4.1-mini", reasoningLevel: "medium" },
    })
    const read = await readLazycodexAgentOverridesFile(home)
    expect(read.librarian?.model).toBe("gpt-5.4-mini")
    const raw = await readFile(join(home, ".grok", "lazycodex-agent-overrides.json"), "utf8")
    expect(raw).toContain("librarian")
  })

  test("merge prefers file over role config for explorer", () => {
    const role = defaultLazycodexAgentConfig(discovery)
    const merged = mergeLazycodexAgentOverrides(
      role,
      { librarian: { model: "bundled-lib", reasoningLevel: "low" } },
      { explorer: { model: "from-file", reasoningLevel: "high" } },
    )
    expect(merged.explorer.model).toBe("from-file")
    expect(merged.librarian?.model).toBe("bundled-lib")
    expect(merged.reasoning.model).toBe(role.reasoning.model)
  })

  test("bundled defaults include default and ulw agents", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    expect(bundled.default?.model).toBe("grok-4.20-0309-reasoning")
    expect(bundled.default?.reasoningLevel).toBe("high")
    expect(bundled.ulw?.model).toBe("grok-4.3")
    expect(bundled.ulw?.reasoningLevel).toBe("xhigh")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("default")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("ulw")
  })

  test("writes and reads all 6 model fields including fallback (Wave 1A parity)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-override-6field-"))
    await writeLazycodexAgentOverridesFile(home, {
      explorer: {
        model: "gpt-5.4-mini",
        reasoningLevel: "low",
        serviceTier: "fast",
        modelFallback: "grok-3-mini-fast",
        modelFallbackReasoningLevel: "low",
        modelFallbackServiceTier: "default",
      },
    })
    const read = await readLazycodexAgentOverridesFile(home)
    expect(read.explorer?.serviceTier).toBe("fast")
    expect(read.explorer?.modelFallback).toBe("grok-3-mini-fast")
    expect(read.explorer?.modelFallbackReasoningLevel).toBe("low")
    expect(read.explorer?.modelFallbackServiceTier).toBe("default")
    const raw = await readFile(join(home, ".grok", "lazycodex-agent-overrides.json"), "utf8")
    expect(raw).toContain("service_tier")
    expect(raw).toContain("model_fallback")
  })
})
