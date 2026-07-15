import type { ModelRequirement } from "./model-requirement-types"

/**
 * Agent model fallback chains.
 *
 * Order: **upstream OMO chain first**, then Grok (`xai`) safety-net entries at the
 * bottom so connected Claude/GPT/Kimi/etc. still win when available, while pure-Grok
 * hosts still resolve via the same table.
 *
 * Host-neutral: this table does **not** read `~/.grok/config.toml`. The Grok adapter
 * feeds `availableModels` / `connectedProviders` (and only enables multi-provider
 * promotion when a real CLI proxy is configured — see `catalog-from-config` +
 * `applyRecommendationsToOverrideMap({ hasCliProxy })`). Without a proxy, foreign
 * openai/anthropic/cx routes must not be selected or host inference 401s after auth recovery.
 *
 * Upstream source: oh-my-openagent `packages/model-core/src/agent-model-requirements.ts`.
 */
export const AGENT_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  sisyphus: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max",
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      {
        providers: [
          "opencode",
          "bailian-coding-plan",
          "moonshotai",
          "moonshotai-cn",
          "firmware",
          "ollama-cloud",
          "aihubmix",
          "vercel",
        ],
        model: "kimi-k2.5",
      },
      { providers: ["openai", "github-copilot", "opencode", "vercel"], model: "gpt-5.5", variant: "medium" },
      { providers: ["opencode", "bailian-coding-plan", "vercel"], model: "glm-5" },
      { providers: ["opencode"], model: "big-pickle" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4.3", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
    requiresAnyModel: true,
  },
  hephaestus: {
    fallbackChain: [
      {
        providers: ["openai", "vercel"],
        model: "gpt-5.6-sol",
        variant: "high",
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium",
      },
      // Grok safety net (last) — deep specialist prefers frontier coding/reasoning
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
    // Upstream is GPT-family-gated; include xai so pure-Grok hosts still activate.
    requiresProvider: ["openai", "github-copilot", "opencode", "vercel", "xai"],
    requiresAnyModel: true,
  },
  oracle: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high",
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max",
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  librarian: {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4-mini-fast" },
      { providers: ["opencode-go", "bailian-coding-plan"], model: "qwen3.5-plus" },
      { providers: ["vercel"], model: "minimax-m2.7-highspeed" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["anthropic", "github-copilot", "vercel"], model: "claude-haiku-4-5" },
      { providers: ["openai", "vercel"], model: "gpt-5.4-nano" },
      // Grok safety net (last) — utility: prefer fast
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  explore: {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4-mini-fast" },
      { providers: ["opencode-go", "bailian-coding-plan"], model: "qwen3.5-plus" },
      { providers: ["vercel"], model: "minimax-m2.7-highspeed" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["anthropic", "github-copilot", "vercel"], model: "claude-haiku-4-5" },
      { providers: ["openai", "vercel"], model: "gpt-5.4-nano" },
      // Grok safety net (last) — utility: prefer fast
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "multimodal-looker": {
    fallbackChain: [
      { providers: ["openai", "opencode", "vercel"], model: "gpt-5.5", variant: "medium" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["vercel"], model: "glm-4.6v" },
      { providers: ["openai", "github-copilot", "opencode", "vercel"], model: "gpt-5-nano" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4.3" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  prometheus: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max",
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high",
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
      },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  metis: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-sonnet-4-6",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max",
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high",
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  momus: {
    fallbackChain: [
      {
        providers: ["openai", "vercel"],
        model: "gpt-5.6-sol",
        variant: "xhigh",
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "xhigh",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max",
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  atlas: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode", "vercel"], model: "claude-sonnet-4-6" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium",
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4.3", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "sisyphus-junior": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode", "vercel"], model: "claude-sonnet-4-6" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium",
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["opencode"], model: "big-pickle" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
}
