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
  it("atlas has only the default variant with bundled content", () => {
    expect(Object.keys(atlas)).toEqual(["default"])
    expectBundledPromptSource(bundled(atlas, "default"), "packages/prompts-core/prompts/atlas/default.md")
  })

  it("ultrawork has only the default variant", () => {
    expect(Object.keys(ultrawork)).toEqual(["default"])
    expectBundledPromptSource(bundled(ultrawork, "default"), "packages/prompts-core/prompts/ultrawork/default.md")
  })

  it("ultrawork planning routes through the ulw-plan skill", () => {
    const prompt = bundled(ultrawork, "default").content
    expect(prompt).toContain("ulw-plan")
    expect(prompt).not.toContain("task(subagent_type=\"plan\"")
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
  it("returns default variant regardless of model or agent", () => {
    expect(resolveVariant({ modelID: "xai/grok-4", variants: ultrawork })).toBe("default")
    expect(resolveVariant({ modelID: "openai/gpt-5", variants: ultrawork })).toBe("default")
    expect(resolveVariant({ agentName: "prometheus", variants: ultrawork })).toBe("default")
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

  it("resolves default variant for non-grok models too", () => {
    const result = resolveGrokAgentPrompt({
      agent: "ultrawork",
      modelID: "openai/gpt-5",
    })
    expectLoadedPrompt(result, "packages/prompts-core/prompts/ultrawork/default.md")
  })
})
