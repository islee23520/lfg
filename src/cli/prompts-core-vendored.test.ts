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
} from "../core/omo/prompts-core/index"
import type { VariantTable, BundledPromptSource, LoadedPrompt } from "../core/omo/prompts-core/types"
import {
  resolveGrokAgentPrompt,
} from "../grok/prompts/grok-prompt-adapter"

const atlas = atlasPromptVariants as VariantTable
const ultrawork = ultraworkPromptVariants as VariantTable

function bundled(table: VariantTable, name: string): BundledPromptSource {
  const source = table[name]
  if (!source || source.kind !== "bundled") {
    throw new Error(`Expected bundled source for ${name}`)
  }
  return source
}

function expectBundledPromptSource(source: BundledPromptSource, filePath: string): void {
  expect(source.filePath).toBe(filePath)
  expect(source.content.trim().length).toBeGreaterThan(0)
}

function expectLoadedPrompt(loaded: LoadedPrompt, filePath: string): void {
  expect(loaded.filePath).toBe(filePath)
  expect(loaded.hadFrontmatter).toBe(false)
  expect(loaded.parseError).toBe(false)
  expect(loaded.frontmatter).toEqual({})
  expect(loaded.body.trim().length).toBeGreaterThan(0)
}

describe("prompts-core: prompt tables", () => {
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
      expectBundledPromptSource(entry, `packages/prompts-core/prompts/atlas/${name}.md`)
    }
  })

  it("ultrawork has planner, gpt, gemini, glm, default variants", () => {
    const variantNames = Object.keys(ultrawork)
    expect(variantNames).toEqual(
      expect.arrayContaining(["planner", "gpt", "gemini", "glm", "default"]),
    )
    for (const name of variantNames) {
      const entry = bundled(ultrawork, name)
      expectBundledPromptSource(entry, `packages/prompts-core/prompts/ultrawork/${name}.md`)
    }
  })

  it("ultrawork planning routes through the ulw-plan skill", () => {
    for (const variant of ["default", "gpt", "gemini", "glm"]) {
      const prompt = bundled(ultrawork, variant).content
      expect(prompt).toContain("ulw-plan")
      expect(prompt).not.toContain("task(subagent_type=\"plan\"")
    }
    expect(HYPERPLAN_MODE_PROMPT).toContain("ulw-plan")
    expect(HYPERPLAN_MODE_PROMPT).not.toContain("task(subagent_type=\"plan\"")
  })

  it("prometheus has default variant", () => {
    expectBundledPromptSource(prometheusPromptVariants.default, "packages/prompts-core/prompts/prometheus/default.md")
  })

  it("codex ultrawork has codex variant", () => {
    expectBundledPromptSource(codexUltraworkPromptVariants.codex, "packages/prompts-core/prompts/ultrawork/codex.md")
  })

  it("mode prompts are stripped of trailing newline", () => {
    expect(HYPERPLAN_MODE_PROMPT.trim().length).toBeGreaterThan(0)
    expect(HYPERPLAN_MODE_PROMPT.endsWith("\n")).toBe(false)
    expect(TEAM_MODE_PROMPT.trim().length).toBeGreaterThan(0)
    expect(TEAM_MODE_PROMPT.endsWith("\n")).toBe(false)
  })
})

describe("prompts-core: resolveVariant", () => {
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

describe("prompts-core: loadPromptSync", () => {
  it("loads bundled prompt body without frontmatter", () => {
    const loaded = loadPromptSync({
      source: bundled(ultrawork, "default"),
      name: "ultrawork",
      variant: "default",
    })
    expectLoadedPrompt(loaded, "packages/prompts-core/prompts/ultrawork/default.md")
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
    expectLoadedPrompt(result, "packages/prompts-core/prompts/atlas/default.md")
  })

  it("resolves default variant for prometheus agent", () => {
    const result = resolveGrokAgentPrompt({
      agent: "prometheus",
      modelID: "xai/grok-4",
    })
    expectLoadedPrompt(result, "packages/prompts-core/prompts/prometheus/default.md")
  })

  it("resolves default variant for grok model (ultrawork)", () => {
    const result = resolveGrokAgentPrompt({
      agent: "ultrawork",
      modelID: "xai/grok-4-fast",
    })
    expectLoadedPrompt(result, "packages/prompts-core/prompts/ultrawork/default.md")
  })

  it("resolves codex variant for codex-ultrawork agent", () => {
    const result = resolveGrokAgentPrompt({
      agent: "codex-ultrawork",
      modelID: "xai/grok-4",
    })
    expectLoadedPrompt(result, "packages/prompts-core/prompts/ultrawork/codex.md")
  })

  it("falls back to gpt variant when a gpt model is used", () => {
    const result = resolveGrokAgentPrompt({
      agent: "ultrawork",
      modelID: "openai/gpt-5",
    })
    expectLoadedPrompt(result, "packages/prompts-core/prompts/ultrawork/gpt.md")
  })
})
