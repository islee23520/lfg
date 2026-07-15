import type { ModelRequirement } from "./model-requirement-types"

/**
 * Category model fallback chains.
 *
 * Order: **upstream OMO chain first**, then Grok (`xai`) safety-net entries at the
 * bottom. Same posture as `agent-model-requirements.ts`.
 *
 * Host-neutral: does not read config.toml. Multi-provider entries are only safe when
 * the host adapter has confirmed a CLI proxy (9router / OpenAI-compatible base URL /
 * `omo.providers.*`). Otherwise the adapter must keep the Grok xai tails so sessions
 * do not 401 after auth recovery.
 *
 * Upstream source: oh-my-openagent `packages/model-core/src/category-model-requirements.ts`.
 */
export const CATEGORY_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  "visual-engineering": {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      { providers: ["opencode", "bailian-coding-plan", "vercel"], model: "glm-5" },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max",
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      // Grok safety net (last) — visual needs strong frontier, not mini-fast
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  ultrabrain: {
    fallbackChain: [
      {
        providers: ["openai", "vercel"],
        model: "gpt-5.6-sol",
        variant: "xhigh",
      },
      {
        providers: ["openai", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "xhigh",
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
  deep: {
    fallbackChain: [
      {
        providers: ["openai", "vercel"],
        model: "gpt-5.6-terra",
        variant: "xhigh",
      },
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
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  artistry: {
    fallbackChain: [
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
      { providers: ["openai", "github-copilot", "opencode", "vercel"], model: "gpt-5.5" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5" },
      { providers: ["xai"], model: "grok-4.3" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  quick: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.4-mini",
      },
      {
        providers: ["anthropic", "github-copilot", "vercel"],
        model: "claude-haiku-4-5",
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3-flash",
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["opencode", "vercel"], model: "gpt-5-nano" },
      // Grok safety net (last) — utility: prefer fast
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "unspecified-low": {
    fallbackChain: [
      {
        providers: ["openai", "vercel"],
        model: "gpt-5.6-luna",
        variant: "xhigh",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-sonnet-4-6",
      },
      {
        providers: ["openai", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium",
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3-flash",
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      // Grok safety net (last) — moderate tasks: coding tier before pure mini
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "unspecified-high": {
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
      { providers: ["opencode", "bailian-coding-plan", "vercel"], model: "glm-5" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      { providers: ["opencode-go", "vercel"], model: "glm-5.2" },
      { providers: ["opencode", "bailian-coding-plan", "vercel"], model: "kimi-k2.5" },
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
      // Grok safety net (last)
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  writing: {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3-flash",
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-sonnet-4-6",
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m3" },
      { providers: ["minimax-coding-plan", "minimax-cn-coding-plan"], model: "MiniMax-M3" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      // Grok safety net (last) — docs: prefer fast
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
}
