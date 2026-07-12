import type { ModelRequirement } from "./model-requirement-types"

export const CATEGORY_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  "visual-engineering": {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  ultrabrain: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  deep: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  artistry: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5" },
      { providers: ["xai"], model: "grok-4.3" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  quick: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "unspecified-low": {
    fallbackChain: [
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "unspecified-high": {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  writing: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
};
