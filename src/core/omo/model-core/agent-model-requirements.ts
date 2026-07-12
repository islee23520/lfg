import type { ModelRequirement } from "./model-requirement-types"

export const AGENT_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  sisyphus: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4.3", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
    requiresAnyModel: true,
  },
  hephaestus: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
    requiresProvider: ["xai"],
    requiresAnyModel: true,
  },
  oracle: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  librarian: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  explore: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-3-mini-fast" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "multimodal-looker": {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5" },
      { providers: ["xai"], model: "grok-4.3" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  prometheus: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  metis: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  momus: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "high" },
      { providers: ["xai"], model: "grok-4.3", variant: "high" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  atlas: {
    fallbackChain: [
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4.3", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
  "sisyphus-junior": {
    fallbackChain: [
      { providers: ["xai"], model: "grok-composer-2.5-fast" },
      { providers: ["xai"], model: "grok-4.5", variant: "medium" },
      { providers: ["xai"], model: "grok-4" },
    ],
  },
};
