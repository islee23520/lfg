const REASONING_AGENT_NAMES = /* @__PURE__ */ new Set([
  "metis",
  "momus",
  "plan",
  "ulw-plan",
  "review-work",
  "codex-ultrawork-reviewer",
  "reasoning"
]);
const REASONING_MODEL_PATTERNS = [
  /grok-4\.[0-9]+.*reasoning/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+/i,
  /grok.*reasoning/i,
  /gpt-5\.5/i,
  /gpt-5(?!.*mini)/i,
  /gemini.*pro/i,
  /claude.*opus/i,
  /o[1-4]/i,
  /reasoning/i,
  /reason/i
];
const UTILITY_MODEL_PATTERNS = [
  /grok-3-mini-fast/i,
  /grok-3-mini/i,
  /grok-4\.[0-9]+.*non-reasoning/i,
  /grok.*mini/i,
  /grok.*fast/i,
  /grok-build/i,
  /gpt-5\.[0-9]+-mini/i,
  /gpt-5\.[0-9]+.*mini/i,
  /gpt.*mini/i,
  /mini/i,
  /fast/i,
  /flash/i,
  /gpt-5\.[0-9]+/i,
  /gpt-5/i
];
const GPT_REASONING_MODEL_PATTERNS = [
  /gpt-5\.5/i,
  /gpt-5(?!.*mini)/i,
  /grok-4\.[0-9]+.*reasoning/i,
  /grok-4\.3/i,
  /grok-4\.[0-9]+/i,
  /gemini.*pro/i,
  /claude.*opus/i,
  /o[1-4]/i,
  /reasoning/i
];
const GPT_UTILITY_MODEL_PATTERNS = [
  /gpt-5\.[0-9]+-mini/i,
  /gpt-5\.[0-9]+.*mini/i,
  /gpt.*mini/i,
  /mini/i,
  /fast/i,
  /flash/i,
  /grok-3-mini-fast/i,
  /grok-3-mini/i,
  /grok.*mini/i,
  /grok.*fast/i,
  /grok-build/i,
  /gpt-5\.[0-9]+/i,
  /gpt-5/i
];
function patternsForKind(kind, preset) {
  if (preset === "gpt") {
    return kind === "reasoning" ? GPT_REASONING_MODEL_PATTERNS : GPT_UTILITY_MODEL_PATTERNS;
  }
  return kind === "reasoning" ? REASONING_MODEL_PATTERNS : UTILITY_MODEL_PATTERNS;
}
function selectModelForPatterns(models, kind, preset) {
  const patterns = patternsForKind(kind, preset);
  for (const pattern of patterns) {
    const matches = models.filter((model) => pattern.test(model));
    if (matches.length > 0) {
      return matches.find((m) => m === m.toLowerCase()) ?? matches[0];
    }
  }
  return models[0];
}
function recommendAgentModelFields(agentName, models, preset) {
  const isReasoning = REASONING_AGENT_NAMES.has(agentName);
  const kind = isReasoning ? "reasoning" : "utility";
  const model = selectModelForPatterns(models, kind, preset);
  if (model === void 0) return void 0;
  return {
    model,
    reasoningLevel: isReasoning ? "high" : "low",
    serviceTier: isReasoning ? "default" : "fast"
  };
}
function buildRecommendedModelOverrides(overrides, models, preset) {
  const recommendations = /* @__PURE__ */ new Map();
  for (const agentName of Object.keys(overrides)) {
    const fields = recommendAgentModelFields(agentName, models, preset);
    if (fields !== void 0) {
      recommendations.set(agentName, fields);
    }
  }
  return recommendations;
}
function applyRecommendedModelOverrides(overrides, recommendations) {
  for (const [agentName, fields] of recommendations) {
    const existing = overrides[agentName] ?? {};
    overrides[agentName] = {
      ...existing,
      model: fields.model,
      reasoningLevel: fields.reasoningLevel,
      serviceTier: fields.serviceTier
    };
  }
}
const ROLE_AGENT_NAMES = /* @__PURE__ */ new Set(["explorer", "reasoning", "coding"]);
function applyRecommendationsToOverrideMap(overrides, models, preset) {
  if (models.length === 0) return overrides;
  const out = {};
  for (const [name, setting] of Object.entries(overrides)) {
    if (ROLE_AGENT_NAMES.has(name)) {
      out[name] = setting;
      continue;
    }
    const rec = recommendAgentModelFields(name, models, preset);
    if (rec === void 0) {
      out[name] = setting;
      continue;
    }
    out[name] = {
      ...setting,
      model: rec.model,
      reasoningLevel: rec.reasoningLevel,
      serviceTier: rec.serviceTier
    };
  }
  return out;
}
export {
  GPT_REASONING_MODEL_PATTERNS,
  GPT_UTILITY_MODEL_PATTERNS,
  REASONING_AGENT_NAMES,
  REASONING_MODEL_PATTERNS,
  UTILITY_MODEL_PATTERNS,
  applyRecommendationsToOverrideMap,
  applyRecommendedModelOverrides,
  buildRecommendedModelOverrides,
  recommendAgentModelFields,
  selectModelForPatterns
};
