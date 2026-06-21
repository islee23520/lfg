import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../cli/lfg-models"
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

  test("default agent config uses advertised reasoning effort for selected discovered models", () => {
    const role = defaultLazycodexAgentConfig({
      ...discovery,
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
    })

    expect(role.explorer.reasoningLevel).toBe("low")
    expect(role.reasoning.reasoningLevel).toBe("xhigh")
    expect(role.coding.reasoningLevel).toBe("high")
  })

  test("bundled defaults include default, prometheus, sisyphus, and atlas agents", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    expect(bundled.default?.model).toBe("gpt-5.5")
    expect(bundled.default?.reasoningLevel).toBe("high")
    expect(bundled.prometheus?.model).toBe("gpt-5.5")
    expect(bundled.prometheus?.reasoningLevel).toBe("xhigh")
    expect(bundled.sisyphus?.model).toBe("gpt-5.5")
    expect(bundled.sisyphus?.reasoningLevel).toBe("medium")
    expect(bundled.atlas?.model).toBe("claude-sonnet-4-6")
    expect(bundled.atlas?.reasoningLevel).toBe("high")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("default")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("prometheus")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("sisyphus")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("atlas")
  })

  test("bundled defaults include oracle and sisyphus-junior OMO parity agents", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    expect(bundled.oracle?.model).toBe("gpt-5.5")
    expect(bundled.oracle?.reasoningLevel).toBe("high")
    expect(bundled.oracle?.modelFallback).toBe("gemini-3-pro-high")
    expect(bundled["sisyphus-junior"]?.model).toBe("claude-sonnet-4-6")
    expect(bundled["sisyphus-junior"]?.reasoningLevel).toBe("medium")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("oracle")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("sisyphus-junior")
  })

  test("bundled defaults include OMO category agents (ultrabrain, deep, quick, unspecified-low, unspecified-high, writing)", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    expect(bundled.ultrabrain?.model).toBe("gpt-5.5")
    expect(bundled.ultrabrain?.reasoningLevel).toBe("xhigh")
    expect(bundled.deep?.model).toBe("gpt-5.5")
    expect(bundled.deep?.reasoningLevel).toBe("high")
    expect(bundled.quick?.model).toBe("gpt-5.4-mini-fast")
    expect(bundled.quick?.reasoningLevel).toBe("low")
    expect(bundled["unspecified-low"]?.model).toBe("claude-sonnet-4-6")
    expect(bundled["unspecified-low"]?.reasoningLevel).toBe("low")
    expect(bundled["unspecified-high"]?.model).toBe("gpt-5.5")
    expect(bundled["unspecified-high"]?.reasoningLevel).toBe("high")
    expect(bundled.writing?.model).toBe("gemini-3.1-pro-low")
    expect(bundled.writing?.reasoningLevel).toBe("low")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("ultrabrain")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("deep")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("quick")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("unspecified-low")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("unspecified-high")
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toContain("writing")
  })

  test("bundled fast utility agents use upstream gpt-5.4-mini-fast ids", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()

    expect(bundled.explorer?.model).toBe("gpt-5.4-mini-fast")
    expect(bundled.explorer?.serviceTier).toBe("fast")
    expect(bundled.librarian?.model).toBe("gpt-5.4-mini-fast")
    expect(bundled.librarian?.serviceTier).toBe("fast")
    expect(bundled.quick?.model).toBe("gpt-5.4-mini-fast")
    expect(bundled.quick?.serviceTier).toBe("fast")
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
