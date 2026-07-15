import { describe, expect, test } from "vitest";

import {
  AGENT_MODEL_REQUIREMENTS,
  fuzzyMatchModel,
  resolveModelPipeline,
  transformModelForProvider,
} from "./index";

describe("model-core", () => {
  test("resolveModelPipeline resolves UI-selected model as override", () => {
    expect(
      resolveModelPipeline({
        intent: { uiSelectedModel: " openai/gpt-5.5 " },
        constraints: { availableModels: new Set() },
        policy: { systemDefaultModel: "xai/grok-4" },
      }),
    ).toEqual({ model: "openai/gpt-5.5", provenance: "override" });
  });

  test("resolveModelPipeline resolves user model as override", () => {
    expect(
      resolveModelPipeline({
        intent: { userModel: "anthropic/claude-opus-4-7" },
        constraints: { availableModels: new Set(["openai/gpt-5.5"]) },
        policy: { systemDefaultModel: "xai/grok-4" },
      }),
    ).toEqual({ model: "anthropic/claude-opus-4-7", provenance: "override" });
  });

  test("resolveModelPipeline resolves category default with available-model fuzzy match", () => {
    expect(
      resolveModelPipeline({
        intent: { categoryDefaultModel: "anthropic/claude-opus-4-7" },
        constraints: {
          availableModels: new Set([
            "anthropic/claude-opus-4.7-20260601",
            "openai/gpt-5.5",
          ]),
        },
        policy: { systemDefaultModel: "xai/grok-4" },
      }),
    ).toEqual({
      model: "anthropic/claude-opus-4.7-20260601",
      provenance: "category-default",
      attempted: ["anthropic/claude-opus-4-7"],
    });
  });

  test("resolveModelPipeline falls through to fallback chain", () => {
    expect(
      resolveModelPipeline({
        intent: { categoryDefaultModel: "anthropic/claude-opus-4-7" },
        constraints: { availableModels: new Set(["openai/gpt-5.5-latest"]) },
        policy: {
          fallbackChain: [
            { providers: ["openai"], model: "gpt-5.5", variant: "medium" },
          ],
          systemDefaultModel: "xai/grok-4",
        },
      }),
    ).toEqual({
      model: "openai/gpt-5.5-latest",
      provenance: "provider-fallback",
      variant: "medium",
      attempted: ["anthropic/claude-opus-4-7"],
    });
  });

  test("resolveModelPipeline falls through to system default", () => {
    expect(
      resolveModelPipeline({
        intent: { categoryDefaultModel: "anthropic/claude-opus-4-7" },
        constraints: { availableModels: new Set(["google/gemini-3.1-pro"]) },
        policy: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.5" }],
          systemDefaultModel: "xai/grok-4",
        },
      }),
    ).toEqual({
      model: "xai/grok-4",
      provenance: "system-default",
      attempted: ["anthropic/claude-opus-4-7"],
    });
  });

  test("resolveModelPipeline returns undefined with no system default", () => {
    expect(
      resolveModelPipeline({
        constraints: { availableModels: new Set() },
      }),
    ).toBeUndefined();
  });

  test("fuzzyMatchModel supports exact and shortest-prefix matches", () => {
    expect(
      fuzzyMatchModel(
        "openai/gpt-5.5",
        new Set(["openai/gpt-5.5", "openai/gpt-5.5-long"]),
      ),
    ).toBe("openai/gpt-5.5");

    expect(
      fuzzyMatchModel(
        "gpt-5.5",
        new Set(["openai/gpt-5.5-longer", "openai/gpt-5.5-mini"]),
        ["openai"],
      ),
    ).toBe("openai/gpt-5.5-mini");
  });

  test("AGENT_MODEL_REQUIREMENTS includes sisyphus and hephaestus", () => {
    expect(AGENT_MODEL_REQUIREMENTS.sisyphus?.fallbackChain.length).toBeGreaterThan(0);
    expect(AGENT_MODEL_REQUIREMENTS.hephaestus?.fallbackChain.length).toBeGreaterThan(0);
  });

  test("agent/category chains keep OMO providers first and Grok xai last", async () => {
    const { CATEGORY_MODEL_REQUIREMENTS } = await import("./category-model-requirements");

    for (const [name, req] of Object.entries(AGENT_MODEL_REQUIREMENTS)) {
      const chain = req.fallbackChain;
      expect(chain.length, name).toBeGreaterThan(1);
      // First entry is never pure-xai (OMO primary comes first).
      expect(chain[0]?.providers.includes("xai") && chain[0]?.providers.length === 1, name).toBe(false);
      // Last entry is Grok safety net.
      const last = chain[chain.length - 1]!;
      expect(last.providers, name).toContain("xai");
      expect(last.model, name).toMatch(/^grok/);
    }

    for (const [name, req] of Object.entries(CATEGORY_MODEL_REQUIREMENTS)) {
      const chain = req.fallbackChain;
      expect(chain.length, name).toBeGreaterThan(1);
      expect(chain[0]?.providers.includes("xai") && chain[0]?.providers.length === 1, name).toBe(false);
      const last = chain[chain.length - 1]!;
      expect(last.providers, name).toContain("xai");
      expect(last.model, name).toMatch(/^grok/);
    }

    // Hephaestus remains GPT-first but activates on pure Grok via xai in requiresProvider.
    expect(AGENT_MODEL_REQUIREMENTS.hephaestus?.requiresProvider).toContain("openai");
    expect(AGENT_MODEL_REQUIREMENTS.hephaestus?.requiresProvider).toContain("xai");
    expect(AGENT_MODEL_REQUIREMENTS.sisyphus?.fallbackChain[0]?.model).toBe("claude-opus-4-7");
    expect(CATEGORY_MODEL_REQUIREMENTS["visual-engineering"]?.fallbackChain[0]?.model).toBe("gemini-3.1-pro");
  });

  test("transformModelForProvider is identity for Grok models", () => {
    expect(transformModelForProvider("xai", "grok-4.5")).toBe("grok-4.5");
    expect(transformModelForProvider("xai", "grok-3-mini-fast")).toBe("grok-3-mini-fast");
  });
});
