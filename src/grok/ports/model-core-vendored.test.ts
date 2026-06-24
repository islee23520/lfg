import { describe, expect, test } from "vitest";

import {
  AGENT_MODEL_REQUIREMENTS,
  fuzzyMatchModel,
  isGeminiModel,
  isGptModel,
  isKimiK2Model,
  resolveModelPipeline,
  transformModelForProvider,
} from "./vendor/model-core-vendored";

describe("model-core-vendored", () => {
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

  test("model family detectors identify GPT, Gemini, and Kimi K2 without treating Grok as GPT", () => {
    expect(isGptModel("openai/gpt-5.5")).toBe(true);
    expect(isGeminiModel("google/gemini-3.1-pro")).toBe(true);
    expect(isKimiK2Model("moonshotai/kimi-k2.6")).toBe(true);
    expect(isGptModel("xai/grok-4")).toBe(false);
  });

  test("AGENT_MODEL_REQUIREMENTS includes sisyphus and hephaestus", () => {
    expect(AGENT_MODEL_REQUIREMENTS.sisyphus?.fallbackChain.length).toBeGreaterThan(0);
    expect(AGENT_MODEL_REQUIREMENTS.hephaestus?.fallbackChain.length).toBeGreaterThan(0);
  });

  test("transformModelForProvider applies provider-specific transforms", () => {
    expect(transformModelForProvider("openai", "gpt-5.5")).toBe("gpt-5.5");
    expect(transformModelForProvider("vercel", "gpt-5.5")).toBe("openai/gpt-5.5");
    expect(transformModelForProvider("google", "gemini-3.1-pro")).toBe(
      "gemini-3.1-pro-preview",
    );
  });
});
