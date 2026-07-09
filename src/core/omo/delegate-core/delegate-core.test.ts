import { describe, expect, test } from "vitest";

import {
  buildRetryGuidance,
  detectDelegateTaskError,
  resolveModelForDelegateTask,
  type DelegateModelResolutionDeps,
} from "./index";

const noCacheDeps: DelegateModelResolutionDeps = {
  connectedProviders: null,
  hasProviderModelsCache: false,
  hasConnectedProvidersCache: false,
};

const providerCacheDeps: DelegateModelResolutionDeps = {
  connectedProviders: null,
  hasProviderModelsCache: true,
  hasConnectedProvidersCache: false,
};

describe("delegate-core", () => {
  test("resolveModelForDelegateTask returns the user model when set", () => {
    expect(
      resolveModelForDelegateTask(
        {
          userModel: " openai/gpt-5.4 ",
          availableModels: new Set(),
          systemDefaultModel: "xai/grok-4",
        },
        noCacheDeps,
      ),
    ).toEqual({ model: "openai/gpt-5.4" });
  });

  test("resolveModelForDelegateTask promotes reachable user fallback model with variant", () => {
    expect(
      resolveModelForDelegateTask(
        {
          userModel: "quotio/claude-haiku-4-5-unavailable",
          userFallbackModels: ["openai/gpt-5.4 high"],
          availableModels: new Set(["openai/gpt-5.4-preview"]),
        },
        noCacheDeps,
      ),
    ).toEqual({
      model: "openai/gpt-5.4-preview",
      variant: "high",
      matchedFallback: true,
    });
  });

  test("resolveModelForDelegateTask falls through fallback chain then system default", () => {
    expect(
      resolveModelForDelegateTask(
        {
          availableModels: new Set(["openai/gpt-5.4-preview"]),
          categoryDefaultModel: "anthropic/claude-sonnet-4-6",
          fallbackChain: [
            { providers: ["openai"], model: "gpt-5.4", variant: "medium" },
          ],
          systemDefaultModel: "xai/grok-4",
        },
        providerCacheDeps,
      ),
    ).toEqual({
      model: "openai/gpt-5.4-preview",
      variant: "medium",
      fallbackEntry: { providers: ["openai"], model: "gpt-5.4", variant: "medium" },
      matchedFallback: true,
    });

    expect(
      resolveModelForDelegateTask(
        {
          availableModels: new Set(["google/gemini-3.1-pro"]),
          categoryDefaultModel: "anthropic/claude-sonnet-4-6",
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.4" }],
          systemDefaultModel: "xai/grok-4",
        },
        providerCacheDeps,
      ),
    ).toEqual({ model: "xai/grok-4" });
  });

  test("resolveModelForDelegateTask selects first connected fallback provider on cold cache", () => {
    const fallbackEntry = { providers: ["openai"], model: "gpt-5.4", variant: "medium" };

    expect(
      resolveModelForDelegateTask(
        {
          availableModels: new Set(),
          fallbackChain: [
            { providers: ["anthropic"], model: "claude-sonnet-4-6" },
            fallbackEntry,
          ],
        },
        {
          connectedProviders: ["openai"],
          hasProviderModelsCache: true,
          hasConnectedProvidersCache: true,
        },
      ),
    ).toEqual({
      model: "openai/gpt-5.4",
      variant: "medium",
      fallbackEntry,
      matchedFallback: true,
    });
  });

  test("detectDelegateTaskError recognizes delegate errors and ignores non-errors", () => {
    const output = '[ERROR] Unknown category: "bad". Available: visual-engineering, ultrabrain';

    expect(detectDelegateTaskError(output)).toEqual({
      errorType: "unknown_category",
      originalOutput: output,
    });
    expect(detectDelegateTaskError("delegate task completed successfully")).toBeNull();
  });

  test("buildRetryGuidance includes fix hint and available options", () => {
    const output = '[ERROR] Unknown category: "bad". Available: visual-engineering, ultrabrain';
    const error = detectDelegateTaskError(output);

    expect(error).not.toBeNull();
    const guidance = buildRetryGuidance(error!);

    expect(guidance).toContain("Use a valid category from the Available list in the error message");
    expect(guidance).toContain("**Available Options**: visual-engineering, ultrabrain");
  });
});
