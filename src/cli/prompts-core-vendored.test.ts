import { describe, it, expect } from "vitest"
import {
  atlasPromptVariants,
  ultraworkPromptVariants,
  prometheusPromptVariants,
  codexUltraworkPromptVariants,
  HYPERPLAN_MODE_PROMPT,
  TEAM_MODE_PROMPT,
  resolveVariant,
  loadPromptSync,
} from "../grok-adapter/prompts-core-vendored/index"
import type { VariantTable, BundledPromptSource } from "../grok-adapter/prompts-core-vendored/types"
import {
  resolveGrokAgentPrompt,
} from "../grok-adapter/grok-prompt-adapter"

const atlas = atlasPromptVariants as VariantTable
const ultrawork = ultraworkPromptVariants as VariantTable

function bundled(table: VariantTable, name: string): BundledPromptSource {
  const source = table[name]
  if (!source || source.kind !== "bundled") {
    throw new Error(`Expected bundled source for ${name}`)
  }
  return source
}

describe("prompts-core-vendored: prompt tables", () => {
  it("atlas has all expected variants with bundled content", () => {
    const variantNames = Object.keys(atlas)
    expect(variantNames).toEqual(
      expect.arrayContaining([
        "default",
        "gpt",
        "gemini",
        "kimi",
        "kimi-k2-7",
        "glm",
        "opus-4-7",
      ]),
    )
    for (const name of variantNames) {
      const entry = bundled(atlas, name)
      expect(entry.content.length).toBeGreaterThan(0)
    }
  })

  it("ultrawork has planner, gpt, gemini, glm, default variants", () => {
    const variantNames = Object.keys(ultrawork)
    expect(variantNames).toEqual(
      expect.arrayContaining(["planner", "gpt", "gemini", "glm", "default"]),
    )
    for (const name of variantNames) {
      const entry = bundled(ultrawork, name)
      expect(entry.content.length).toBeGreaterThan(0)
    }
  })

  it("prometheus has default variant", () => {
    expect(prometheusPromptVariants.default).toBeDefined()
    expect(prometheusPromptVariants.default.content).toContain("Prometheus")
  })

  it("codex ultrawork has codex variant", () => {
    expect(codexUltraworkPromptVariants.codex).toBeDefined()
    expect(codexUltraworkPromptVariants.codex.content).toContain("ULTRAWORK MODE ENABLED")
  })

  it("mode prompts are stripped of trailing newline", () => {
    expect(HYPERPLAN_MODE_PROMPT).toContain("HYPERPLAN MODE ENABLED")
    expect(HYPERPLAN_MODE_PROMPT.endsWith("\n")).toBe(false)
    expect(TEAM_MODE_PROMPT).toContain("[team-mode]")
    expect(TEAM_MODE_PROMPT.endsWith("\n")).toBe(false)
  })
})

describe("prompts-core-vendored: resolveVariant", () => {
  it("returns planner for prometheus agent when planner variant exists", () => {
    const variant = resolveVariant({
      agentName: "prometheus",
      variants: ultrawork,
    })
    expect(variant).toBe("planner")
  })

  it("returns gpt variant for gpt model", () => {
    const variant = resolveVariant({
      modelID: "openai/gpt-5",
      variants: ultrawork,
    })
    expect(variant).toBe("gpt")
  })

  it("returns gemini variant for gemini model", () => {
    const variant = resolveVariant({
      modelID: "google/gemini-2.5-pro",
      variants: ultrawork,
    })
    expect(variant).toBe("gemini")
  })

  it("falls back to default for grok models (no family match)", () => {
    const variant = resolveVariant({
      modelID: "xai/grok-4",
      variants: ultrawork,
    })
    expect(variant).toBe("default")
  })

  it("returns first variant when no default exists and no match", () => {
    const variant = resolveVariant({
      modelID: "xai/grok-4",
      variants: codexUltraworkPromptVariants,
    })
    expect(variant).toBe("codex")
  })

  it("throws on empty variant table", () => {
    expect(() => resolveVariant({ variants: {} })).toThrow(TypeError)
  })
})

describe("prompts-core-vendored: loadPromptSync", () => {
  it("loads bundled prompt body without frontmatter", () => {
    const loaded = loadPromptSync({
      source: bundled(ultrawork, "default"),
      name: "ultrawork",
      variant: "default",
    })
    expect(loaded.hadFrontmatter).toBe(false)
    expect(loaded.body).toContain("ULTRAWORK MODE ENABLED")
  })

  it("applies sync runtime injections", () => {
    const loaded = loadPromptSync({
      source: {
        kind: "bundled",
        content: "Hello {{name}}!",
        filePath: "test.md",
      },
      name: "test",
      variant: "default",
      inject: [{ placeholder: "{{name}}", resolver: () => "World" }],
    })
    expect(loaded.body).toBe("Hello World!")
  })
})

describe("grok-prompt-adapter: resolveGrokAgentPrompt", () => {
  it("resolves default variant for grok model (atlas)", () => {
    const result = resolveGrokAgentPrompt({
      agent: "atlas",
      modelID: "xai/grok-4",
    })
    expect(result.body).toContain("Atlas")
    expect(result.body).toContain("Master Orchestrator")
  })

  it("resolves planner variant for prometheus agent", () => {
    const result = resolveGrokAgentPrompt({
      agent: "prometheus",
      modelID: "xai/grok-4",
    })
    expect(result.body).toContain("Prometheus")
  })

  it("resolves default variant for grok model (ultrawork)", () => {
    const result = resolveGrokAgentPrompt({
      agent: "ultrawork",
      modelID: "xai/grok-4-fast",
    })
    expect(result.body).toContain("ULTRAWORK MODE ENABLED")
  })

  it("resolves codex variant for codex-ultrawork agent", () => {
    const result = resolveGrokAgentPrompt({
      agent: "codex-ultrawork",
      modelID: "xai/grok-4",
    })
    expect(result.body).toContain("ULTRAWORK MODE ENABLED")
  })

  it("falls back to gpt variant when a gpt model is used", () => {
    const result = resolveGrokAgentPrompt({
      agent: "ultrawork",
      modelID: "openai/gpt-5",
    })
    expect(result.body).toContain("ULTRAWORK MODE ENABLED")
  })
})
