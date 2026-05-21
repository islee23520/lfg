// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// vendor/omo-standalone/packages/model-core/src/model-requirements.ts
var AGENT_MODEL_REQUIREMENTS = {
  sisyphus: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      {
        providers: [
          "opencode",
          "moonshotai",
          "moonshotai-cn",
          "firmware",
          "ollama-cloud",
          "aihubmix",
          "vercel"
        ],
        model: "kimi-k2.5"
      },
      { providers: ["openai", "github-copilot", "opencode", "vercel"], model: "gpt-5.5", variant: "medium" },
      { providers: ["zai-coding-plan", "opencode", "vercel"], model: "glm-5" },
      { providers: ["opencode"], model: "big-pickle" }
    ],
    requiresAnyModel: true
  },
  hephaestus: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "venice", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium"
      }
    ],
    requiresProvider: ["openai", "github-copilot", "venice", "opencode", "vercel"]
  },
  oracle: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high"
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" }
    ]
  },
  librarian: {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4-mini-fast" },
      { providers: ["opencode-go"], model: "qwen3.5-plus" },
      { providers: ["vercel"], model: "minimax-m2.7-highspeed" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["anthropic", "opencode", "vercel"], model: "claude-haiku-4-5" },
      { providers: ["openai", "opencode", "vercel"], model: "gpt-5.4-nano" }
    ]
  },
  explore: {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4-mini-fast" },
      { providers: ["opencode-go"], model: "qwen3.5-plus" },
      { providers: ["vercel"], model: "minimax-m2.7-highspeed" },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["anthropic", "opencode", "vercel"], model: "claude-haiku-4-5" },
      { providers: ["openai", "opencode", "vercel"], model: "gpt-5.4-nano" }
    ]
  },
  "multimodal-looker": {
    fallbackChain: [
      { providers: ["openai", "opencode", "vercel"], model: "gpt-5.5", variant: "medium" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["zai-coding-plan", "vercel"], model: "glm-4.6v" },
      { providers: ["openai", "github-copilot", "opencode", "vercel"], model: "gpt-5-nano" }
    ]
  },
  prometheus: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high"
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro"
      }
    ]
  },
  metis: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-sonnet-4-6"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high"
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" },
      { providers: ["kimi-for-coding"], model: "k2p5" }
    ]
  },
  momus: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "xhigh"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high"
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" }
    ]
  },
  atlas: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode", "vercel"], model: "claude-sonnet-4-6" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium"
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" }
    ]
  },
  "sisyphus-junior": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode", "vercel"], model: "claude-sonnet-4-6" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium"
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["opencode"], model: "big-pickle" }
    ]
  }
};
var CATEGORY_MODEL_REQUIREMENTS = {
  "visual-engineering": {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high"
      },
      { providers: ["zai-coding-plan", "opencode", "vercel"], model: "glm-5" },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" },
      { providers: ["kimi-for-coding"], model: "k2p5" }
    ]
  },
  ultrabrain: {
    fallbackChain: [
      {
        providers: ["openai", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "xhigh"
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" }
    ]
  },
  deep: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "venice", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "medium"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high"
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" }
    ]
  },
  artistry: {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3.1-pro",
        variant: "high"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      { providers: ["openai", "github-copilot", "opencode", "vercel"], model: "gpt-5.5" },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" }
    ]
  },
  quick: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.4-mini"
      },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-haiku-4-5"
      },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3-flash"
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" },
      { providers: ["opencode", "vercel"], model: "gpt-5-nano" }
    ]
  },
  "unspecified-low": {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-sonnet-4-6"
      },
      {
        providers: ["openai", "opencode", "vercel"],
        model: "gpt-5.3-codex",
        variant: "medium"
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3-flash"
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" }
    ]
  },
  "unspecified-high": {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-opus-4-7",
        variant: "max"
      },
      {
        providers: ["openai", "github-copilot", "opencode", "vercel"],
        model: "gpt-5.5",
        variant: "high"
      },
      { providers: ["zai-coding-plan", "opencode", "vercel"], model: "glm-5" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      { providers: ["opencode-go", "vercel"], model: "glm-5.1" },
      { providers: ["opencode", "vercel"], model: "kimi-k2.5" },
      {
        providers: [
          "opencode",
          "moonshotai",
          "moonshotai-cn",
          "firmware",
          "ollama-cloud",
          "aihubmix",
          "vercel"
        ],
        model: "kimi-k2.5"
      }
    ]
  },
  writing: {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode", "vercel"],
        model: "gemini-3-flash"
      },
      { providers: ["opencode-go", "vercel"], model: "kimi-k2.6" },
      {
        providers: ["anthropic", "github-copilot", "opencode", "vercel"],
        model: "claude-sonnet-4-6"
      },
      { providers: ["opencode-go", "vercel"], model: "minimax-m2.7" }
    ]
  }
};
// vendor/omo-standalone/packages/model-core/src/model-capability-aliases.ts
var EXACT_ALIAS_RULES = [
  {
    aliasModelID: "gemini-3-pro-high",
    ruleID: "gemini-3-pro-tier-alias",
    canonicalModelID: "gemini-3-pro-preview",
    rationale: "Legacy Gemini 3 tier suffixes still need to land on the canonical preview model."
  },
  {
    aliasModelID: "gemini-3-pro-low",
    ruleID: "gemini-3-pro-tier-alias",
    canonicalModelID: "gemini-3-pro-preview",
    rationale: "Legacy Gemini 3 tier suffixes still need to land on the canonical preview model."
  },
  {
    aliasModelID: "k2pb",
    ruleID: "kimi-k2pb-alias",
    canonicalModelID: "k2p5",
    rationale: "Kimi for Coding exposes k2pb while the bundled capabilities snapshot uses the canonical k2p5 ID."
  },
  {
    aliasModelID: "claude-opus-4.7",
    ruleID: "claude-opus-dotted-version-alias",
    canonicalModelID: "claude-opus-4-7",
    rationale: "GitHub Copilot exposes Claude Opus 4.7 with dotted version syntax while the snapshot uses dashed syntax."
  }
];
var EXACT_ALIAS_RULES_BY_MODEL = new Map(EXACT_ALIAS_RULES.map((rule) => [rule.aliasModelID, rule]));
var PATTERN_ALIAS_RULES = [
  {
    ruleID: "claude-thinking-legacy-alias",
    description: "Normalizes the legacy claude-opus-4-7-thinking id to the canonical snapshot ID.",
    match: (normalizedModelID) => /^claude-opus-4-7-thinking$/.test(normalizedModelID),
    canonicalize: () => "claude-opus-4-7"
  },
  {
    ruleID: "gemini-3.1-pro-tier-alias",
    description: "Normalizes Gemini 3.1 Pro tier suffixes to the canonical snapshot ID.",
    match: (normalizedModelID) => /^gemini-3\.1-pro-(?:high|low)$/.test(normalizedModelID),
    canonicalize: () => "gemini-3.1-pro"
  }
];
function normalizeLookupModelID(modelID) {
  return modelID.trim().toLowerCase();
}
function stripProviderPrefixForAliasLookup(normalizedModelID) {
  const slashIndex = normalizedModelID.indexOf("/");
  if (slashIndex <= 0 || slashIndex === normalizedModelID.length - 1) {
    return normalizedModelID;
  }
  return normalizedModelID.slice(slashIndex + 1);
}
function resolveModelIDAlias(modelID) {
  const requestedModelID = normalizeLookupModelID(modelID);
  const aliasLookupModelID = stripProviderPrefixForAliasLookup(requestedModelID);
  const exactRule = EXACT_ALIAS_RULES_BY_MODEL.get(aliasLookupModelID);
  if (exactRule) {
    return {
      requestedModelID,
      canonicalModelID: exactRule.canonicalModelID,
      source: "exact-alias",
      ruleID: exactRule.ruleID
    };
  }
  for (const rule of PATTERN_ALIAS_RULES) {
    if (!rule.match(aliasLookupModelID)) {
      continue;
    }
    return {
      requestedModelID,
      canonicalModelID: rule.canonicalize(aliasLookupModelID),
      source: "pattern-alias",
      ruleID: rule.ruleID
    };
  }
  return {
    requestedModelID,
    canonicalModelID: aliasLookupModelID,
    source: "canonical"
  };
}
function getExactModelIDAliasRules() {
  return EXACT_ALIAS_RULES;
}
function getPatternModelIDAliasRules() {
  return PATTERN_ALIAS_RULES;
}
// vendor/omo-standalone/packages/model-core/src/model-normalization.ts
function normalizeModel(model) {
  const trimmed = model?.trim();
  return trimmed || undefined;
}
function normalizeModelID(modelID) {
  return modelID.replace(/\.(\d+)/g, "-$1");
}

// vendor/omo-standalone/packages/model-core/src/model-capability-heuristics.ts
var HEURISTIC_MODEL_FAMILY_REGISTRY = [
  {
    family: "claude-opus",
    pattern: /claude(?:-\d+(?:-\d+)*)?-opus/,
    variants: ["low", "medium", "high", "max"],
    supportsThinking: true
  },
  {
    family: "claude-non-opus",
    includes: ["claude"],
    variants: ["low", "medium", "high"],
    supportsThinking: true
  },
  {
    family: "openai-reasoning",
    pattern: /(?:^|\/)o\d(?:$|-)/,
    variants: ["low", "medium", "high"],
    reasoningEfforts: ["none", "minimal", "low", "medium", "high"]
  },
  {
    family: "gpt-5",
    includes: ["gpt-5"],
    variants: ["low", "medium", "high", "xhigh"],
    reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
  },
  {
    family: "gpt-legacy",
    includes: ["gpt"],
    variants: ["low", "medium", "high"]
  },
  {
    family: "gemini",
    includes: ["gemini"],
    variants: ["low", "medium", "high"]
  },
  {
    family: "grok",
    includes: ["grok"],
    variants: ["low", "medium", "high"],
    reasoningEfforts: ["low", "medium", "high"]
  },
  {
    family: "kimi-thinking",
    includes: ["kimi-thinking", "k2-thinking", "k2-think"],
    pattern: /(?:kimi|k2).*-(?:thinking|think)/,
    variants: ["low", "medium", "high"],
    supportsThinking: true
  },
  {
    family: "kimi",
    includes: ["kimi", "k2"],
    variants: ["low", "medium", "high"],
    supportsThinking: false
  },
  {
    family: "glm",
    includes: ["glm"],
    variants: ["low", "medium", "high"]
  },
  {
    family: "minimax",
    includes: ["minimax"],
    variants: ["low", "medium", "high"],
    supportsThinking: false
  },
  {
    family: "deepseek",
    includes: ["deepseek"],
    variants: ["low", "medium", "high"],
    reasoningEfforts: ["high", "max"],
    reasoningEffortAliases: {
      low: "high",
      medium: "high",
      xhigh: "max"
    }
  },
  {
    family: "mistral",
    includes: ["mistral", "codestral"],
    variants: ["low", "medium", "high"]
  },
  {
    family: "llama",
    includes: ["llama"],
    variants: ["low", "medium", "high"]
  }
];
function detectHeuristicModelFamily(modelID) {
  const normalizedModelID = normalizeModelID(modelID).toLowerCase();
  for (const definition of HEURISTIC_MODEL_FAMILY_REGISTRY) {
    if (definition.pattern?.test(normalizedModelID)) {
      return definition;
    }
    if (definition.includes?.some((value) => normalizedModelID.includes(value))) {
      return definition;
    }
  }
  return;
}
// vendor/omo-standalone/packages/model-core/src/model-capability-guardrails.ts
function normalizeLookupModelID2(modelID) {
  return modelID.trim().toLowerCase();
}
function getBuiltInRequirementModelIDs() {
  const modelIDs = new Set;
  for (const requirement of Object.values(AGENT_MODEL_REQUIREMENTS)) {
    for (const entry of requirement.fallbackChain) {
      modelIDs.add(entry.model);
    }
  }
  for (const requirement of Object.values(CATEGORY_MODEL_REQUIREMENTS)) {
    for (const entry of requirement.fallbackChain) {
      modelIDs.add(entry.model);
    }
  }
  return [...modelIDs].sort();
}
function collectModelCapabilityGuardrailIssues(input = {}) {
  const snapshot = input.snapshot ?? input.loadBundledSnapshot?.();
  if (!snapshot) {
    return [];
  }
  const snapshotModelIDs = new Set(Object.keys(snapshot.models).map((modelID) => normalizeLookupModelID2(modelID)));
  const requirementModelIDs = input.requirementModelIDs ?? getBuiltInRequirementModelIDs();
  const issues = [];
  for (const rule of getExactModelIDAliasRules()) {
    if (!snapshotModelIDs.has(rule.canonicalModelID)) {
      issues.push({
        kind: "alias-target-missing-from-snapshot",
        ruleID: rule.ruleID,
        aliasModelID: rule.aliasModelID,
        canonicalModelID: rule.canonicalModelID,
        message: `Alias ${rule.aliasModelID} points to missing snapshot model ${rule.canonicalModelID}.`
      });
    }
    if (snapshotModelIDs.has(rule.aliasModelID)) {
      issues.push({
        kind: "exact-alias-collides-with-snapshot",
        ruleID: rule.ruleID,
        aliasModelID: rule.aliasModelID,
        canonicalModelID: rule.canonicalModelID,
        message: `Alias ${rule.aliasModelID} now exists in models.dev and should be reviewed instead of force-mapping to ${rule.canonicalModelID}.`
      });
    }
  }
  for (const rule of getPatternModelIDAliasRules()) {
    for (const modelID of snapshotModelIDs) {
      if (!rule.match(modelID)) {
        continue;
      }
      const canonicalModelID = rule.canonicalize(modelID);
      if (canonicalModelID === modelID) {
        continue;
      }
      issues.push({
        kind: "pattern-alias-collides-with-snapshot",
        ruleID: rule.ruleID,
        modelID,
        canonicalModelID,
        message: `Pattern alias ${rule.ruleID} would rewrite canonical snapshot model ${modelID} to ${canonicalModelID}.`
      });
    }
  }
  for (const modelID of requirementModelIDs) {
    const aliasResolution = resolveModelIDAlias(modelID);
    if (aliasResolution.source !== "canonical") {
      issues.push({
        kind: "built-in-model-relies-on-alias",
        modelID: aliasResolution.requestedModelID,
        canonicalModelID: aliasResolution.canonicalModelID,
        ruleID: aliasResolution.ruleID ?? "unknown-alias-rule",
        message: `Built-in requirement model ${aliasResolution.requestedModelID} should be canonical and not rely on alias rule ${aliasResolution.ruleID}.`
      });
    }
    if (!snapshotModelIDs.has(aliasResolution.canonicalModelID)) {
      issues.push({
        kind: "built-in-model-missing-from-snapshot",
        modelID: aliasResolution.requestedModelID,
        canonicalModelID: aliasResolution.canonicalModelID,
        message: `Built-in requirement model ${aliasResolution.requestedModelID} resolves to ${aliasResolution.canonicalModelID}, which is missing from the bundled snapshot.`
      });
    }
  }
  return issues;
}
// vendor/omo-standalone/packages/model-core/src/model-settings-compatibility.ts
var VARIANT_LADDER = ["low", "medium", "high", "xhigh", "max"];
var REASONING_LADDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
function downgradeWithinLadder(value, allowed, ladder) {
  const requestedIndex = ladder.indexOf(value);
  if (requestedIndex === -1)
    return;
  for (let index = requestedIndex;index >= 0; index -= 1) {
    if (allowed.includes(ladder[index])) {
      return ladder[index];
    }
  }
  return;
}
function normalizeCapabilitiesVariants(capabilities) {
  if (!capabilities?.variants || capabilities.variants.length === 0) {
    return;
  }
  return capabilities.variants.map((v) => v.toLowerCase());
}
function normalizeCapabilitiesReasoningEfforts(capabilities) {
  if (!capabilities?.reasoningEfforts || capabilities.reasoningEfforts.length === 0) {
    return;
  }
  return capabilities.reasoningEfforts.map((value) => value.toLowerCase());
}
function resolveField(normalized, familyCaps, ladder, familyKnown, metadataOverride, familyAliases) {
  const aliased = familyAliases?.[normalized];
  if (aliased && (metadataOverride?.includes(aliased) || familyCaps?.includes(aliased))) {
    return { value: aliased, reason: "unsupported-by-model-family" };
  }
  if (metadataOverride) {
    if (metadataOverride.includes(normalized))
      return { value: normalized };
    return {
      value: downgradeWithinLadder(normalized, metadataOverride, ladder),
      reason: "unsupported-by-model-metadata"
    };
  }
  if (familyCaps) {
    if (familyCaps.includes(normalized))
      return { value: normalized };
    return {
      value: downgradeWithinLadder(normalized, familyCaps, ladder),
      reason: "unsupported-by-model-family"
    };
  }
  if (familyKnown) {
    return { value: undefined, reason: "unsupported-by-model-family" };
  }
  return { value: undefined, reason: "unknown-model-family" };
}
function resolveCompatibleModelSettings(input) {
  const family = detectHeuristicModelFamily(input.modelID);
  const familyKnown = Boolean(family);
  const changes = [];
  const metadataVariants = normalizeCapabilitiesVariants(input.capabilities);
  const metadataReasoningEfforts = normalizeCapabilitiesReasoningEfforts(input.capabilities);
  let variant = input.desired.variant;
  if (variant !== undefined) {
    const normalized = variant.toLowerCase();
    const resolved = resolveField(normalized, family?.variants, VARIANT_LADDER, familyKnown, metadataVariants);
    if (resolved.value !== normalized && resolved.reason) {
      changes.push({ field: "variant", from: variant, to: resolved.value, reason: resolved.reason });
    }
    variant = resolved.value;
  }
  let reasoningEffort = input.desired.reasoningEffort;
  if (reasoningEffort !== undefined) {
    const normalized = reasoningEffort.toLowerCase();
    const resolved = resolveField(normalized, family?.reasoningEfforts, REASONING_LADDER, familyKnown, metadataReasoningEfforts, family?.reasoningEffortAliases);
    if (resolved.value !== normalized && resolved.reason) {
      changes.push({ field: "reasoningEffort", from: reasoningEffort, to: resolved.value, reason: resolved.reason });
    }
    reasoningEffort = resolved.value;
  }
  let temperature = input.desired.temperature;
  if (temperature !== undefined && input.capabilities?.supportsTemperature === false) {
    changes.push({
      field: "temperature",
      from: String(temperature),
      to: undefined,
      reason: "unsupported-by-model-metadata"
    });
    temperature = undefined;
  }
  let topP = input.desired.topP;
  if (topP !== undefined && input.capabilities?.supportsTopP === false) {
    changes.push({
      field: "topP",
      from: String(topP),
      to: undefined,
      reason: "unsupported-by-model-metadata"
    });
    topP = undefined;
  }
  let maxTokens = input.desired.maxTokens;
  if (maxTokens !== undefined && maxTokens <= 0) {
    maxTokens = undefined;
  }
  if (maxTokens !== undefined && input.capabilities?.maxOutputTokens !== undefined && input.capabilities.maxOutputTokens > 0 && maxTokens > input.capabilities.maxOutputTokens) {
    changes.push({
      field: "maxTokens",
      from: String(maxTokens),
      to: String(input.capabilities.maxOutputTokens),
      reason: "max-output-limit"
    });
    maxTokens = input.capabilities.maxOutputTokens;
  }
  let thinking = input.desired.thinking;
  if (thinking !== undefined && input.capabilities?.supportsThinking === false) {
    changes.push({
      field: "thinking",
      from: JSON.stringify(thinking),
      to: undefined,
      reason: "unsupported-by-model-metadata"
    });
    thinking = undefined;
  }
  return {
    variant,
    reasoningEffort,
    ...input.desired.temperature !== undefined ? { temperature } : {},
    ...input.desired.topP !== undefined ? { topP } : {},
    ...input.desired.maxTokens !== undefined ? { maxTokens } : {},
    ...input.desired.thinking !== undefined ? { thinking } : {},
    changes
  };
}
// vendor/omo-standalone/packages/model-core/src/model-availability.ts
function normalizeModelName(name) {
  return name.toLowerCase().replace(/claude-(opus|sonnet|haiku)-(\d+)[.-](\d+)/g, "claude-$1-$2.$3");
}
function fuzzyMatchModel(target, available, providers) {
  if (available.size === 0) {
    return null;
  }
  const targetNormalized = normalizeModelName(target);
  let candidates = Array.from(available);
  if (providers && providers.length > 0) {
    const providerSet = new Set(providers);
    candidates = candidates.filter((model) => {
      const [provider] = model.split("/");
      return providerSet.has(provider);
    });
  }
  if (candidates.length === 0) {
    return null;
  }
  const matches = candidates.filter((model) => normalizeModelName(model).includes(targetNormalized));
  if (matches.length === 0) {
    return null;
  }
  const exactMatch = matches.find((model) => normalizeModelName(model) === targetNormalized);
  if (exactMatch) {
    return exactMatch;
  }
  const exactModelIdMatches = matches.filter((model) => {
    const modelId = model.split("/").slice(1).join("/");
    return normalizeModelName(modelId) === targetNormalized;
  });
  if (exactModelIdMatches.length > 0) {
    return exactModelIdMatches.reduce((shortest, current) => current.length < shortest.length ? current : shortest);
  }
  return matches.reduce((shortest, current) => current.length < shortest.length ? current : shortest);
}
function isModelAvailable(targetModel, availableModels) {
  return fuzzyMatchModel(targetModel, availableModels) !== null;
}

// vendor/omo-standalone/packages/model-core/src/provider-model-id-transform.ts
function inferSubProvider(model) {
  if (model.startsWith("claude-"))
    return "anthropic";
  if (model.startsWith("gpt-"))
    return "openai";
  if (model.startsWith("gemini-"))
    return "google";
  if (model.startsWith("grok-"))
    return "xai";
  if (model.startsWith("minimax-"))
    return "minimax";
  if (model.startsWith("kimi-"))
    return "moonshotai";
  if (model.startsWith("glm-"))
    return "zai";
  return;
}
var CLAUDE_VERSION_DOT = /claude-(\w+)-(\d+)-(\d+)/g;
var GEMINI_31_PRO_PREVIEW = /gemini-3\.1-pro(?!-)/g;
var GEMINI_3_FLASH_PREVIEW = /gemini-3-flash(?!-)/g;
function claudeVersionDot(model) {
  return model.replace(CLAUDE_VERSION_DOT, "claude-$1-$2.$3");
}
function applyGatewayTransforms(model) {
  return claudeVersionDot(model).replace(GEMINI_31_PRO_PREVIEW, "gemini-3.1-pro-preview");
}
function transformModelForProvider(provider, model) {
  if (provider === "vercel") {
    const slashIndex = model.indexOf("/");
    if (slashIndex !== -1) {
      const subProvider2 = model.substring(0, slashIndex);
      const subModel = model.substring(slashIndex + 1);
      return `${subProvider2}/${applyGatewayTransforms(subModel)}`;
    }
    const subProvider = inferSubProvider(model);
    if (subProvider) {
      return `${subProvider}/${applyGatewayTransforms(model)}`;
    }
    return model;
  }
  if (provider === "github-copilot") {
    return claudeVersionDot(model).replace(GEMINI_31_PRO_PREVIEW, "gemini-3.1-pro-preview").replace(GEMINI_3_FLASH_PREVIEW, "gemini-3-flash-preview");
  }
  if (provider === "google") {
    return model.replace(GEMINI_31_PRO_PREVIEW, "gemini-3.1-pro-preview").replace(GEMINI_3_FLASH_PREVIEW, "gemini-3-flash-preview");
  }
  if (provider === "anthropic") {
    return claudeVersionDot(model);
  }
  return model;
}

// vendor/omo-standalone/packages/model-core/src/model-resolution-pipeline.ts
var logImplementationForTesting;
function log(message, data) {
  const logImplementation = logImplementationForTesting;
  if (!logImplementation) {
    return;
  }
  if (arguments.length === 1) {
    logImplementation(message);
    return;
  }
  logImplementation(message, data);
}
function _setModelResolutionLogImplementationForTesting(logImplementation) {
  logImplementationForTesting = logImplementation;
}
var DEFAULT_MODEL_RESOLUTION_DEPS = {
  fuzzyMatchModel,
  transformModelForProvider
};
function resolveModelPipeline(request, providerCache = {
  readConnectedProvidersCache: () => null,
  findProviderModelMetadata: () => {
    return;
  }
}, deps = DEFAULT_MODEL_RESOLUTION_DEPS) {
  const attempted = [];
  const { intent, constraints, policy } = request;
  const availableModels = constraints.availableModels;
  const fallbackChain = policy?.fallbackChain;
  const systemDefaultModel = policy?.systemDefaultModel;
  const normalizedUiModel = normalizeModel(intent?.uiSelectedModel);
  if (normalizedUiModel) {
    log("Model resolved via UI selection", { model: normalizedUiModel });
    return { model: normalizedUiModel, provenance: "override" };
  }
  const normalizedUserModel = normalizeModel(intent?.userModel);
  if (normalizedUserModel) {
    log("Model resolved via config override", { model: normalizedUserModel });
    return { model: normalizedUserModel, provenance: "override" };
  }
  const normalizedCategoryDefault = normalizeModel(intent?.categoryDefaultModel);
  if (normalizedCategoryDefault) {
    attempted.push(normalizedCategoryDefault);
    if (availableModels.size > 0) {
      const parts = normalizedCategoryDefault.split("/");
      const providerHint = parts.length >= 2 ? [parts[0]] : undefined;
      const match = deps.fuzzyMatchModel(normalizedCategoryDefault, availableModels, providerHint);
      if (match) {
        log("Model resolved via category default (fuzzy matched)", {
          original: normalizedCategoryDefault,
          matched: match
        });
        return { model: match, provenance: "category-default", attempted };
      }
    } else {
      const connectedProviders = constraints.connectedProviders ?? providerCache.readConnectedProvidersCache();
      if (connectedProviders === null) {
        log("Model resolved via category default (no cache, first run)", {
          model: normalizedCategoryDefault
        });
        return { model: normalizedCategoryDefault, provenance: "category-default", attempted };
      }
      const parts = normalizedCategoryDefault.split("/");
      if (parts.length >= 2) {
        const provider = parts[0];
        if (connectedProviders.includes(provider)) {
          const modelName = parts.slice(1).join("/");
          const transformedModel = `${provider}/${deps.transformModelForProvider(provider, modelName)}`;
          log("Model resolved via category default (connected provider)", {
            model: transformedModel,
            original: normalizedCategoryDefault
          });
          return { model: transformedModel, provenance: "category-default", attempted };
        }
      }
    }
    log("Category default model not available, falling through to fallback chain", {
      model: normalizedCategoryDefault
    });
  }
  const userFallbackModels = intent?.userFallbackModels;
  if (userFallbackModels && userFallbackModels.length > 0) {
    if (availableModels.size === 0) {
      const connectedProviders = constraints.connectedProviders ?? providerCache.readConnectedProvidersCache();
      const connectedSet = connectedProviders ? new Set(connectedProviders) : null;
      if (connectedSet !== null) {
        for (const model of userFallbackModels) {
          attempted.push(model);
          const parts = model.split("/");
          if (parts.length >= 2) {
            const provider = parts[0];
            if (connectedSet.has(provider)) {
              const modelName = parts.slice(1).join("/");
              const transformedModel = `${provider}/${deps.transformModelForProvider(provider, modelName)}`;
              log("Model resolved via user fallback_models (connected provider)", { model: transformedModel, original: model });
              return { model: transformedModel, provenance: "provider-fallback", attempted };
            }
          }
        }
        log("No connected provider found in user fallback_models, falling through to hardcoded chain");
      }
    } else {
      for (const model of userFallbackModels) {
        attempted.push(model);
        const parts = model.split("/");
        const providerHint = parts.length >= 2 ? [parts[0]] : undefined;
        const match = deps.fuzzyMatchModel(model, availableModels, providerHint);
        if (match) {
          log("Model resolved via user fallback_models (availability confirmed)", { model, match });
          return { model: match, provenance: "provider-fallback", attempted };
        }
      }
      log("No available model found in user fallback_models, falling through to hardcoded chain");
    }
  }
  if (fallbackChain && fallbackChain.length > 0) {
    if (availableModels.size === 0) {
      const connectedProviders = constraints.connectedProviders ?? providerCache.readConnectedProvidersCache();
      const connectedSet = connectedProviders ? new Set(connectedProviders) : null;
      if (connectedSet === null) {
        log("Model fallback chain skipped (no connected providers cache) - falling through to system default");
      } else {
        for (const entry of fallbackChain) {
          for (const provider of entry.providers) {
            if (connectedSet.has(provider)) {
              const transformedModelId = deps.transformModelForProvider(provider, entry.model);
              const model = `${provider}/${transformedModelId}`;
              log("Model resolved via fallback chain (connected provider)", {
                provider,
                model: transformedModelId,
                variant: entry.variant
              });
              return {
                model,
                provenance: "provider-fallback",
                variant: entry.variant,
                attempted
              };
            }
          }
        }
        log("No connected provider found in fallback chain, falling through to system default");
      }
    } else {
      for (const entry of fallbackChain) {
        for (const provider of entry.providers) {
          const fullModel = `${provider}/${entry.model}`;
          const match = deps.fuzzyMatchModel(fullModel, availableModels, [provider]);
          if (match) {
            log("Model resolved via fallback chain (availability confirmed)", {
              provider,
              model: entry.model,
              match,
              variant: entry.variant
            });
            return {
              model: match,
              provenance: "provider-fallback",
              variant: entry.variant,
              attempted
            };
          }
        }
        const crossProviderMatch = deps.fuzzyMatchModel(entry.model, availableModels);
        if (crossProviderMatch) {
          log("Model resolved via fallback chain (cross-provider fuzzy match)", {
            model: entry.model,
            match: crossProviderMatch,
            variant: entry.variant
          });
          return {
            model: crossProviderMatch,
            provenance: "provider-fallback",
            variant: entry.variant,
            attempted
          };
        }
      }
      log("No available model found in fallback chain, falling through to system default");
    }
  }
  if (systemDefaultModel === undefined) {
    log("No model resolved - systemDefaultModel not configured");
    return;
  }
  log("Model resolved via system default", { model: systemDefaultModel });
  return { model: systemDefaultModel, provenance: "system-default", attempted };
}

// vendor/omo-standalone/packages/model-core/src/known-variants.ts
var KNOWN_VARIANTS = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "minimal",
  "none",
  "auto",
  "thinking"
]);

// vendor/omo-standalone/packages/model-core/src/connected-providers-cache.ts
var exports_connected_providers_cache = {};
__export(exports_connected_providers_cache, {
  readProviderModelsCache: () => readProviderModelsCache,
  readConnectedProvidersCache: () => readConnectedProvidersCache,
  findProviderModelMetadata: () => findProviderModelMetadata,
  connectedProvidersAdapter: () => connectedProvidersAdapter
});
function readConnectedProvidersCache() {
  return null;
}
function findProviderModelMetadata(_providerID, _modelID) {
  return;
}
function readProviderModelsCache() {
  return null;
}
var connectedProvidersAdapter = {
  readConnectedProvidersCache,
  findProviderModelMetadata,
  readProviderModelsCache
};

// vendor/omo-standalone/packages/model-core/src/model-resolver.ts
function resolveModel(input) {
  return normalizeModel(input.userModel) ?? normalizeModel(input.inheritedModel) ?? input.systemDefault;
}
function resolveModelWithFallback(input, connectedProvidersAdapter2 = exports_connected_providers_cache) {
  const { uiSelectedModel, userModel, userFallbackModels, categoryDefaultModel, fallbackChain, availableModels, systemDefaultModel } = input;
  const resolved = resolveModelPipeline({
    intent: { uiSelectedModel, userModel, userFallbackModels, categoryDefaultModel },
    constraints: { availableModels },
    policy: { fallbackChain, systemDefaultModel }
  }, connectedProvidersAdapter2);
  if (!resolved) {
    return;
  }
  return {
    model: resolved.model,
    source: resolved.provenance,
    variant: resolved.variant
  };
}
function normalizeFallbackModels(models) {
  if (!models)
    return;
  if (typeof models === "string")
    return [models];
  return models;
}
function flattenToFallbackModelStrings(models) {
  if (!models)
    return;
  return models.map((entry) => {
    if (typeof entry === "string")
      return entry;
    const variant = entry.variant;
    if (variant) {
      const model = entry.model.replace(/\([^()]+\)\s*$/, "").replace(/\s+([a-z][a-z0-9_-]*)\s*$/i, (match, suffix) => {
        const normalized = String(suffix).toLowerCase();
        return KNOWN_VARIANTS.has(normalized) ? "" : match;
      }).trim();
      return `${model}(${variant})`;
    }
    return entry.model;
  });
}
// vendor/omo-standalone/packages/model-core/src/model-format-normalizer.ts
function normalizeModelFormat(model) {
  if (!model) {
    return;
  }
  if (typeof model === "object" && "providerID" in model && "modelID" in model) {
    return { providerID: model.providerID, modelID: model.modelID };
  }
  if (typeof model === "string") {
    const parts = model.split("/");
    if (parts.length >= 2) {
      return { providerID: parts[0], modelID: parts.slice(1).join("/") };
    }
  }
  return;
}
// vendor/omo-standalone/packages/model-core/src/model-string-parser.ts
var KNOWN_VARIANTS2 = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "minimal",
  "none",
  "auto",
  "thinking"
]);
function parseVariantFromModelID(rawModelID) {
  if (typeof rawModelID !== "string") {
    return { modelID: "" };
  }
  const trimmedModelID = rawModelID.trim();
  if (!trimmedModelID) {
    return { modelID: "" };
  }
  const parenthesizedVariant = trimmedModelID.match(/^(.*)\(([^()]+)\)\s*$/);
  if (parenthesizedVariant) {
    const modelID = parenthesizedVariant[1]?.trim() ?? "";
    const variant = parenthesizedVariant[2]?.trim();
    return variant ? { modelID, variant } : { modelID };
  }
  const spaceVariant = trimmedModelID.match(/^(.*\S)\s+([a-z][a-z0-9_-]*)$/i);
  if (spaceVariant) {
    const modelID = spaceVariant[1]?.trim() ?? "";
    const variant = spaceVariant[2]?.trim().toLowerCase();
    if (variant && KNOWN_VARIANTS2.has(variant)) {
      return { modelID, variant };
    }
  }
  return { modelID: trimmedModelID };
}
function parseModelString(model) {
  if (typeof model !== "string")
    return;
  const trimmedModel = model.trim();
  if (!trimmedModel)
    return;
  const separatorIndex = trimmedModel.indexOf("/");
  if (separatorIndex === -1) {
    return;
  }
  const providerID = trimmedModel.slice(0, separatorIndex).trim();
  const rawModelID = trimmedModel.slice(separatorIndex + 1).trim();
  if (!providerID || !rawModelID) {
    return;
  }
  const parsedModel = parseVariantFromModelID(rawModelID);
  if (!parsedModel.modelID) {
    return;
  }
  return parsedModel.variant ? { providerID, modelID: parsedModel.modelID, variant: parsedModel.variant } : { providerID, modelID: parsedModel.modelID };
}
// vendor/omo-standalone/packages/model-core/src/model-sanitizer.ts
function sanitizeModelField(model, source = "claude-code") {
  if (source === "claude-code") {
    return;
  }
  if (typeof model === "string" && model.trim().length > 0) {
    return model.trim();
  }
  return;
}
// vendor/omo-standalone/packages/model-core/src/fallback-chain-from-models.ts
function parseVariantFromModel(rawModel) {
  if (typeof rawModel !== "string") {
    return { modelID: "" };
  }
  const trimmedModel = rawModel.trim();
  if (!trimmedModel) {
    return { modelID: "" };
  }
  const parenthesizedVariant = trimmedModel.match(/^(.*)\(([^()]+)\)\s*$/);
  if (parenthesizedVariant) {
    const modelID = parenthesizedVariant[1]?.trim() ?? "";
    const variant = parenthesizedVariant[2]?.trim();
    return variant ? { modelID, variant } : { modelID };
  }
  const spaceVariant = trimmedModel.match(/^(.*\S)\s+([a-z][a-z0-9_-]*)$/i);
  if (spaceVariant) {
    const modelID = spaceVariant[1]?.trim() ?? "";
    const variant = spaceVariant[2]?.trim().toLowerCase();
    if (variant && KNOWN_VARIANTS.has(variant)) {
      return { modelID, variant };
    }
  }
  return { modelID: trimmedModel };
}
function parseFallbackModelEntry(model, contextProviderID, defaultProviderID = "opencode") {
  if (typeof model !== "string")
    return;
  const trimmed = model.trim();
  if (!trimmed)
    return;
  const parts = trimmed.split("/");
  const providerID = parts.length >= 2 ? parts[0].trim() : contextProviderID?.trim() || defaultProviderID;
  const rawModelID = parts.length >= 2 ? parts.slice(1).join("/").trim() : trimmed;
  if (!providerID || !rawModelID)
    return;
  const parsed = parseVariantFromModel(rawModelID);
  if (!parsed.modelID)
    return;
  return {
    providers: [providerID],
    model: parsed.modelID,
    variant: parsed.variant
  };
}
function parseFallbackModelObjectEntry(obj, contextProviderID, defaultProviderID = "opencode") {
  const base = parseFallbackModelEntry(obj.model, contextProviderID, defaultProviderID);
  if (!base)
    return;
  return {
    ...base,
    variant: obj.variant ?? base.variant,
    reasoningEffort: obj.reasoningEffort,
    temperature: obj.temperature,
    top_p: obj.top_p,
    maxTokens: obj.maxTokens,
    thinking: obj.thinking
  };
}
function findMostSpecificFallbackEntry(providerID, modelID, chain) {
  const resolved = `${providerID}/${modelID}`.toLowerCase();
  const matches = [];
  for (const entry of chain) {
    for (const p of entry.providers) {
      const candidate = `${p}/${entry.model}`.toLowerCase();
      if (resolved.startsWith(candidate)) {
        matches.push({ entry, matchLen: candidate.length });
        break;
      }
    }
  }
  if (matches.length === 0)
    return;
  matches.sort((a, b) => b.matchLen - a.matchLen);
  return matches[0].entry;
}
function buildFallbackChainFromModels(fallbackModels, contextProviderID, defaultProviderID = "opencode") {
  const normalized = normalizeFallbackModels(fallbackModels);
  if (!normalized || normalized.length === 0)
    return;
  const parsed = normalized.map((entry) => {
    if (typeof entry === "string") {
      return parseFallbackModelEntry(entry, contextProviderID, defaultProviderID);
    }
    return parseFallbackModelObjectEntry(entry, contextProviderID, defaultProviderID);
  }).filter((entry) => entry !== undefined);
  if (parsed.length === 0)
    return;
  return parsed;
}
// vendor/omo-standalone/packages/model-core/src/model-error-classifier.ts
var RETRYABLE_ERROR_NAMES = new Set([
  "providermodelnotfounderror",
  "ratelimiterror",
  "modelunavailableerror",
  "providerconnectionerror",
  "authenticationerror"
]);
var STOP_ERROR_NAMES = new Set([
  "quotaexceedederror",
  "insufficientcreditserror",
  "freeusagelimiterror"
]);
var NON_RETRYABLE_ERROR_NAMES = new Set([
  "messageabortederror",
  "permissiondeniederror",
  "contextlengtherror",
  "timeouterror",
  "validationerror",
  "syntaxerror",
  "usererror"
]);
var RETRYABLE_MESSAGE_PATTERNS = [
  "rate_limit",
  "rate limit",
  "quota",
  "all credentials for model",
  "cooling down",
  "exhausted your capacity",
  "not found",
  "unavailable",
  "insufficient",
  "too many requests",
  "over limit",
  "overloaded",
  "bad gateway",
  "bad request",
  "unknown provider",
  "provider not found",
  "model_not_supported",
  "model not supported",
  "model is not supported",
  "connection error",
  "network error",
  "timeout",
  "service unavailable",
  "internal_server_error",
  "server_error",
  "free usage",
  "usage exceeded",
  "credit",
  "balance",
  "temporarily unavailable",
  "try again",
  "error occurred while processing",
  "\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "503",
  "502",
  "504",
  "429",
  "529",
  "selected provider is forbidden",
  "provider is forbidden",
  "\u9891\u7387\u9650\u5236",
  "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41",
  "\u6682\u65F6\u4E0D\u53EF\u7528",
  "\u670D\u52A1\u4E0D\u53EF\u7528"
];
var STOP_MESSAGE_PATTERNS = [
  "quota will reset after",
  "quota exceeded",
  "usage limit has been reached",
  "free usage limit",
  "billing limit",
  "billing hard limit",
  "monthly limit",
  "plan limit",
  "subscription quota",
  "subscription limit",
  "payment required",
  "out of credits",
  "credits exhausted",
  "insufficient credits",
  "insufficient balance",
  "credit balance",
  "usage limit for this month",
  "exhausted your capacity",
  "daily call limit",
  "daily limit",
  "usage limit reached for",
  "in arrears",
  "fair use policy",
  "recharge and try",
  "\u4F7F\u7528\u4E0A\u9650",
  "\u989D\u5EA6\u4E0D\u8DB3",
  "\u4F59\u989D\u4E0D\u8DB3",
  "\u5DF2\u8017\u5C3D"
];
var AUTO_RETRY_GATE_PATTERNS = [
  "rate limit",
  "cooling down",
  "credentials for model"
];
function hasProviderAutoRetrySignal(message) {
  if (!message.includes("retrying in")) {
    return false;
  }
  return AUTO_RETRY_GATE_PATTERNS.some((pattern) => message.includes(pattern));
}
function isRetryableModelError(error) {
  if (error.name) {
    const errorNameLower = error.name.toLowerCase();
    if (NON_RETRYABLE_ERROR_NAMES.has(errorNameLower)) {
      return false;
    }
    if (STOP_ERROR_NAMES.has(errorNameLower)) {
      return false;
    }
    if (RETRYABLE_ERROR_NAMES.has(errorNameLower)) {
      return true;
    }
  }
  const msg = error.message?.toLowerCase() ?? "";
  if (STOP_MESSAGE_PATTERNS.some((pattern) => msg.includes(pattern))) {
    return false;
  }
  if (hasProviderAutoRetrySignal(msg)) {
    return true;
  }
  if (error.statusCode != null && (error.statusCode === 429 || error.statusCode === 503 || error.statusCode === 529)) {
    return true;
  }
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => msg.includes(pattern));
}
function shouldRetryError(error) {
  return isRetryableModelError(error);
}
function getNextFallback(fallbackChain, attemptCount) {
  return fallbackChain[attemptCount];
}
function hasMoreFallbacks(fallbackChain, attemptCount) {
  return attemptCount < fallbackChain.length;
}
function selectFallbackProvider(providers, preferredProviderID) {
  return selectFallbackProviderWithCache(providers, exports_connected_providers_cache, preferredProviderID);
}
function selectFallbackProviderWithCache(providers, providerCache, preferredProviderID) {
  const connectedProviders = providerCache.readConnectedProvidersCache();
  if (connectedProviders) {
    const connectedSet = new Set(connectedProviders.map((p) => p.toLowerCase()));
    for (const provider of providers) {
      if (connectedSet.has(provider.toLowerCase())) {
        return provider;
      }
    }
    if (preferredProviderID && connectedSet.has(preferredProviderID.toLowerCase())) {
      return preferredProviderID;
    }
  }
  return providers[0] || preferredProviderID || "opencode";
}
// vendor/omo-standalone/packages/model-core/src/model-capabilities/supplemental-entries.ts
var SUPPLEMENTAL_MODEL_CAPABILITIES = {
  "kimi-k2.6": {
    id: "kimi-k2.6",
    family: "kimi",
    reasoning: true,
    temperature: true,
    toolCall: true,
    modalities: {
      input: ["text", "image", "video"],
      output: ["text"]
    },
    limit: {
      context: 262144,
      output: 262144
    }
  },
  "gpt-5.5": {
    id: "gpt-5.5",
    family: "gpt",
    reasoning: true,
    temperature: false,
    toolCall: true,
    modalities: {
      input: ["text", "image", "pdf"],
      output: ["text"]
    },
    limit: {
      context: 400000,
      input: 272000,
      output: 128000
    }
  },
  "gpt-5.4-mini-fast": {
    id: "gpt-5.4-mini-fast",
    family: "gpt-mini",
    reasoning: true,
    temperature: false,
    toolCall: true,
    modalities: {
      input: ["text", "image"],
      output: ["text"]
    },
    limit: {
      context: 400000,
      input: 272000,
      output: 128000
    }
  }
};

// vendor/omo-standalone/packages/model-core/src/model-capabilities/bundled-snapshot.ts
function getBundledModelCapabilitiesSnapshot(snapshotJson) {
  return {
    ...snapshotJson,
    models: {
      ...snapshotJson.models,
      ...SUPPLEMENTAL_MODEL_CAPABILITIES
    }
  };
}
// vendor/omo-standalone/packages/model-core/src/model-capabilities/runtime-model-readers.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readNumber(value) {
  return typeof value === "number" ? value : undefined;
}
function readStringArray(value) {
  if (!Array.isArray(value)) {
    return;
  }
  const strings = value.filter((item) => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}
function normalizeVariantKeys(value) {
  const arrayVariants = readStringArray(value);
  if (arrayVariants) {
    return arrayVariants.filter((v) => typeof v === "string").map((variant) => variant.toLowerCase());
  }
  if (!isRecord(value)) {
    return;
  }
  const variants = Object.keys(value).map((variant) => variant.toLowerCase());
  return variants.length > 0 ? variants : undefined;
}
function readModalityKeys(value) {
  const stringArray = readStringArray(value);
  if (stringArray) {
    return stringArray.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase());
  }
  if (!isRecord(value)) {
    return;
  }
  const fromNested = Object.values(value).filter((v) => Array.isArray(v)).flat().filter((item) => typeof item === "string");
  if (fromNested.length > 0) {
    return fromNested.map((entry) => entry.toLowerCase());
  }
  const enabled = Object.entries(value).filter(([, supported]) => supported === true).map(([modality]) => modality.toLowerCase());
  return enabled.length > 0 ? enabled : undefined;
}
function normalizeModalities(value) {
  if (!isRecord(value)) {
    return;
  }
  const input = readModalityKeys(value.input);
  const output = readModalityKeys(value.output);
  if (!input && !output) {
    return;
  }
  return {
    ...input ? { input } : {},
    ...output ? { output } : {}
  };
}
function readRuntimeModelCapabilities(runtimeModel) {
  return isRecord(runtimeModel?.capabilities) ? runtimeModel.capabilities : undefined;
}
function readRuntimeModelBoolean(runtimeModel, keys) {
  const runtimeCapabilities = readRuntimeModelCapabilities(runtimeModel);
  for (const key of keys) {
    const value = runtimeModel?.[key];
    if (typeof value === "boolean") {
      return value;
    }
    const capabilityValue = runtimeCapabilities?.[key];
    if (typeof capabilityValue === "boolean") {
      return capabilityValue;
    }
  }
  return;
}
function readRuntimeModel(runtimeModel) {
  return isRecord(runtimeModel) ? runtimeModel : undefined;
}
function readRuntimeModelVariants(runtimeModel) {
  const rootVariants = normalizeVariantKeys(runtimeModel?.variants);
  if (rootVariants) {
    return rootVariants;
  }
  return normalizeVariantKeys(readRuntimeModelCapabilities(runtimeModel)?.variants);
}
function readRuntimeModelModalities(runtimeModel) {
  const rootModalities = normalizeModalities(runtimeModel?.modalities);
  if (rootModalities) {
    return rootModalities;
  }
  const runtimeCapabilities = readRuntimeModelCapabilities(runtimeModel);
  return normalizeModalities(runtimeCapabilities?.modalities) ?? normalizeModalities(runtimeCapabilities);
}
function readRuntimeModelReasoningSupport(runtimeModel) {
  return readRuntimeModelBoolean(runtimeModel, ["reasoning"]);
}
function readRuntimeModelThinkingSupport(runtimeModel) {
  const capabilityValue = readRuntimeModelReasoningSupport(runtimeModel);
  if (capabilityValue !== undefined) {
    return capabilityValue;
  }
  const thinkingSupport = readRuntimeModelBoolean(runtimeModel, ["thinking", "supportsThinking"]);
  if (thinkingSupport !== undefined) {
    return thinkingSupport;
  }
  const runtimeCapabilities = readRuntimeModelCapabilities(runtimeModel);
  for (const key of ["thinking", "supportsThinking"]) {
    const value = runtimeCapabilities?.[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return;
}
function readRuntimeModelTemperatureSupport(runtimeModel) {
  return readRuntimeModelBoolean(runtimeModel, ["temperature"]);
}
function readRuntimeModelTopPSupport(runtimeModel) {
  return readRuntimeModelBoolean(runtimeModel, ["topP", "top_p"]);
}
function readRuntimeModelToolCallSupport(runtimeModel) {
  return readRuntimeModelBoolean(runtimeModel, ["toolCall", "tool_call", "toolcall"]);
}
function readRuntimeModelLimitOutput(runtimeModel) {
  const limit = isRecord(runtimeModel?.limit) ? runtimeModel.limit : readRuntimeModelCapabilities(runtimeModel)?.limit;
  if (!isRecord(limit)) {
    return;
  }
  const output = readNumber(limit.output);
  return output && output > 0 ? output : undefined;
}

// vendor/omo-standalone/packages/model-core/src/model-capabilities/get-model-capabilities.ts
var MODEL_ID_OVERRIDES = {};
function normalizeLookupModelID3(modelID) {
  return modelID.trim().toLowerCase();
}
function getOverride(modelID) {
  return MODEL_ID_OVERRIDES[normalizeLookupModelID3(modelID)];
}
function getModelCapabilities(input) {
  const canonicalization = resolveModelIDAlias(input.modelID);
  const override = getOverride(input.modelID);
  const runtimeModel = readRuntimeModel(input.runtimeModel ?? input.providerCache?.findProviderModelMetadata(input.providerID, input.modelID));
  const runtimeSnapshot = input.runtimeSnapshot;
  const bundledSnapshot = input.bundledSnapshot;
  const snapshotEntry = runtimeSnapshot?.models?.[canonicalization.canonicalModelID] ?? bundledSnapshot?.models?.[canonicalization.canonicalModelID];
  const heuristicFamily = detectHeuristicModelFamily(canonicalization.canonicalModelID);
  const runtimeVariants = readRuntimeModelVariants(runtimeModel);
  const runtimeReasoning = readRuntimeModelReasoningSupport(runtimeModel);
  const runtimeThinking = readRuntimeModelThinkingSupport(runtimeModel);
  const runtimeTemperature = readRuntimeModelTemperatureSupport(runtimeModel);
  const runtimeTopP = readRuntimeModelTopPSupport(runtimeModel);
  const runtimeMaxOutputTokens = readRuntimeModelLimitOutput(runtimeModel);
  const runtimeToolCall = readRuntimeModelToolCallSupport(runtimeModel);
  const runtimeModalities = readRuntimeModelModalities(runtimeModel);
  const snapshotSource = runtimeSnapshot?.models?.[canonicalization.canonicalModelID] ? "runtime-snapshot" : bundledSnapshot?.models?.[canonicalization.canonicalModelID] ? "bundled-snapshot" : "none";
  const familySource = snapshotEntry?.family ? "snapshot" : heuristicFamily?.family ? "heuristic" : "none";
  const variantsSource = runtimeVariants ? "runtime" : override?.variants ? "override" : heuristicFamily?.variants ? "heuristic" : "none";
  const reasoningEffortsSource = override?.reasoningEfforts ? "override" : heuristicFamily?.reasoningEfforts ? "heuristic" : "none";
  const reasoningSource = runtimeReasoning === undefined ? snapshotEntry?.reasoning === undefined ? "none" : snapshotSource : "runtime";
  const supportsThinkingSource = override?.supportsThinking !== undefined ? "override" : heuristicFamily?.supportsThinking !== undefined ? "heuristic" : runtimeThinking !== undefined ? "runtime" : snapshotEntry?.reasoning !== undefined ? snapshotSource : "none";
  const supportsTemperatureSource = runtimeTemperature !== undefined ? "runtime" : override?.supportsTemperature !== undefined ? "override" : snapshotEntry?.temperature !== undefined ? snapshotSource : "none";
  const supportsTopPSource = runtimeTopP !== undefined ? "runtime" : override?.supportsTopP !== undefined ? "override" : "none";
  const maxOutputTokensSource = runtimeMaxOutputTokens !== undefined ? "runtime" : snapshotEntry?.limit?.output !== undefined ? snapshotSource : "none";
  const toolCallSource = runtimeToolCall !== undefined ? "runtime" : snapshotEntry?.toolCall !== undefined ? snapshotSource : "none";
  const modalitiesSource = runtimeModalities !== undefined ? "runtime" : snapshotEntry?.modalities !== undefined ? snapshotSource : "none";
  const resolutionMode = snapshotSource !== "none" && canonicalization.source === "canonical" ? "snapshot-backed" : snapshotSource !== "none" ? "alias-backed" : familySource === "heuristic" || variantsSource === "heuristic" || reasoningEffortsSource === "heuristic" ? "heuristic-backed" : "unknown";
  return {
    requestedModelID: canonicalization.requestedModelID,
    canonicalModelID: canonicalization.canonicalModelID,
    family: snapshotEntry?.family ?? heuristicFamily?.family,
    variants: runtimeVariants ?? override?.variants ?? heuristicFamily?.variants,
    reasoningEfforts: override?.reasoningEfforts ?? heuristicFamily?.reasoningEfforts,
    reasoning: runtimeReasoning ?? snapshotEntry?.reasoning,
    supportsThinking: override?.supportsThinking ?? heuristicFamily?.supportsThinking ?? runtimeThinking ?? snapshotEntry?.reasoning,
    supportsTemperature: runtimeTemperature ?? override?.supportsTemperature ?? snapshotEntry?.temperature,
    supportsTopP: runtimeTopP ?? override?.supportsTopP,
    maxOutputTokens: runtimeMaxOutputTokens ?? snapshotEntry?.limit?.output,
    toolCall: runtimeToolCall ?? snapshotEntry?.toolCall,
    modalities: runtimeModalities ?? snapshotEntry?.modalities,
    diagnostics: {
      resolutionMode,
      canonicalization: {
        source: canonicalization.source,
        ...canonicalization.ruleID ? { ruleID: canonicalization.ruleID } : {}
      },
      snapshot: { source: snapshotSource },
      family: { source: familySource },
      variants: { source: variantsSource },
      reasoningEfforts: { source: reasoningEffortsSource },
      reasoning: { source: reasoningSource },
      supportsThinking: { source: supportsThinkingSource },
      supportsTemperature: { source: supportsTemperatureSource },
      supportsTopP: { source: supportsTopPSource },
      maxOutputTokens: { source: maxOutputTokensSource },
      toolCall: { source: toolCallSource },
      modalities: { source: modalitiesSource }
    }
  };
}
export {
  transformModelForProvider,
  shouldRetryError,
  selectFallbackProviderWithCache,
  selectFallbackProvider,
  sanitizeModelField,
  resolveModelWithFallback,
  resolveModelPipeline,
  resolveModelIDAlias,
  resolveModel,
  resolveCompatibleModelSettings,
  parseVariantFromModelID,
  parseModelString,
  parseFallbackModelObjectEntry,
  parseFallbackModelEntry,
  normalizeModelID,
  normalizeModelFormat,
  normalizeModel,
  normalizeFallbackModels,
  isRetryableModelError,
  isModelAvailable,
  hasMoreFallbacks,
  getPatternModelIDAliasRules,
  getNextFallback,
  getModelCapabilities,
  getExactModelIDAliasRules,
  getBundledModelCapabilitiesSnapshot,
  getBuiltInRequirementModelIDs,
  fuzzyMatchModel,
  flattenToFallbackModelStrings,
  findMostSpecificFallbackEntry,
  detectHeuristicModelFamily,
  collectModelCapabilityGuardrailIssues,
  buildFallbackChainFromModels,
  _setModelResolutionLogImplementationForTesting,
  KNOWN_VARIANTS,
  HEURISTIC_MODEL_FAMILY_REGISTRY,
  CATEGORY_MODEL_REQUIREMENTS,
  AGENT_MODEL_REQUIREMENTS
};
