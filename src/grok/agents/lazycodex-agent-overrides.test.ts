import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultLazycodexAgentConfig, type ModelDiscovery } from "../../cli/models/lfg-models"
import {
  CONFIGURABLE_LAZYCODEX_AGENT_NAMES,
  loadBundledDefaultOmoOverrides,
  mergeLazycodexAgentOverrides,
  readLazycodexAgentOverridesFile,
  readOmoAgentOverridesFile,
  resolveLazycodexAgentOverrides,
  writeOmoAgentOverridesFile,
  writeLazycodexAgentOverridesFile,
  slimNativeAgentOverrides,
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

  test("default agent config uses fixed role defaults, ignoring model-advertised reasoning effort", () => {
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

    // auto uses role defaults (explorer=low, reasoning=high, coding=medium),
    // NOT the model-advertised metadata (which would be low/xhigh/high).
    expect(role.explorer.reasoningLevel).toBe("low")
    expect(role.reasoning.reasoningLevel).toBe("high")
    expect(role.coding.reasoningLevel).toBe("medium")
  })

  test("slims bundled defaults to sisyphus only", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()
    const slim = slimNativeAgentOverrides(bundled)
    expect(Object.keys(slim)).toEqual(["sisyphus"])
    expect(CONFIGURABLE_LAZYCODEX_AGENT_NAMES).toEqual(["sisyphus"])
  })

  test("resolves and persists only native agent override keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-native-overrides-"))
    const role = defaultLazycodexAgentConfig(discovery)

    await writeOmoAgentOverridesFile(home, {
      hephaestus: { model: "retired", reasoningLevel: "high" },
      default: { model: "native-default", reasoningLevel: "medium" },
      explorer: { model: "native-explorer", reasoningLevel: "low" },
      "lazycodex-worker-low": { model: "retired-worker", reasoningLevel: "low" },
    })
    const persisted = await readOmoAgentOverridesFile(home)
    const resolved = await resolveLazycodexAgentOverrides(home, role)

    expect(Object.keys(persisted)).toEqual(["sisyphus"])
    expect(Object.keys(resolved)).toEqual(["sisyphus"])
  })


  test("bundled fast utility agents use grok-3-mini-fast ids", async () => {
    const bundled = await loadBundledDefaultOmoOverrides()

    expect(bundled.explorer?.model).toBe("grok-3-mini-fast")
    expect(bundled.explorer?.serviceTier).toBe("fast")
    expect(bundled.librarian?.model).toBe("grok-3-mini-fast")
    expect(bundled.librarian?.serviceTier).toBe("fast")
    expect(bundled.quick?.model).toBe("grok-3-mini-fast")
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
