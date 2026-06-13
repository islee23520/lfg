const READ_ONLY_AGENT_NAMES = /* @__PURE__ */ new Set([
  "explorer",
  "plan",
  "librarian",
  "metis",
  "momus",
  "codex-ultrawork-reviewer"
]);
function renderGrokRoleTomlFromCodex(codexToml, agentBaseName, modelOverride, promptsDir) {
  const parsed = parseCodexAgentToml(codexToml);
  const model = modelOverride?.model ?? parsed.model;
  const reasoning = modelOverride?.reasoningLevel ?? parsed.modelReasoningEffort;
  const lines = [];
  if (parsed.description.length > 0) {
    lines.push(`description = ${tomlQuote(parsed.description)}`);
  }
  const capability = parsed.defaultCapabilityMode ?? (READ_ONLY_AGENT_NAMES.has(agentBaseName) ? "read-only" : null);
  if (capability !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(capability)}`);
  }
  if (model !== null && model.length > 0) {
    lines.push(`model = ${tomlQuote(model)}`);
  }
  if (reasoning !== null && reasoning.length > 0) {
    lines.push(`reasoning_effort = ${tomlQuote(reasoning)}`);
  }
  appendFallbackLines(lines, modelOverride);
  const prompt = parsed.developerInstructions.trim();
  let promptPath = null;
  let promptBody = null;
  if (prompt.length > 0) {
    promptPath = `${promptsDir}/${agentBaseName}.md`;
    promptBody = `${prompt}
`;
    lines.push(`prompt_file = ${tomlQuote(promptPath)}`);
  }
  return { toml: `${lines.join("\n")}
`, promptPath, promptBody };
}
function renderMinimalGrokRoleToml(agentName, override) {
  const lines = [
    `description = ${tomlQuote(`LazyCodex ${agentName} agent`)}`,
    `model = ${tomlQuote(override.model)}`,
    `reasoning_effort = ${tomlQuote(override.reasoningLevel)}`
  ];
  appendFallbackLines(lines, override);
  return `${lines.join("\n")}
`;
}
function codexAgentTomlToGrokRoleToml(codexToml, modelOverride) {
  const parsed = parseCodexAgentToml(codexToml);
  const model = modelOverride?.model ?? parsed.model;
  const reasoning = modelOverride?.reasoningLevel ?? parsed.modelReasoningEffort;
  const lines = [];
  if (parsed.description.length > 0) {
    lines.push(`description = ${tomlQuote(parsed.description)}`);
  }
  if (parsed.defaultCapabilityMode !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(parsed.defaultCapabilityMode)}`);
  }
  if (model !== null && model.length > 0) {
    lines.push(`model = ${tomlQuote(model)}`);
  }
  if (reasoning !== null && reasoning.length > 0) {
    lines.push(`reasoning_effort = ${tomlQuote(reasoning)}`);
  }
  const prompt = parsed.developerInstructions.trim();
  if (prompt.length > 0) {
    lines.push(`prompt_file = ${tomlQuote(writeInlinePromptRef(prompt))}`);
  }
  return `${lines.join("\n")}
`;
}
function codexAgentTomlToGrokRoleTomlWithPromptBody(codexToml, modelOverride) {
  const parsed = parseCodexAgentToml(codexToml);
  const model = modelOverride?.model ?? parsed.model;
  const reasoning = modelOverride?.reasoningLevel ?? parsed.modelReasoningEffort;
  const lines = [];
  if (parsed.description.length > 0) {
    lines.push(`description = ${tomlQuote(parsed.description)}`);
  }
  if (parsed.defaultCapabilityMode !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(parsed.defaultCapabilityMode)}`);
  }
  if (model !== null && model.length > 0) {
    lines.push(`model = ${tomlQuote(model)}`);
  }
  if (reasoning !== null && reasoning.length > 0) {
    lines.push(`reasoning_effort = ${tomlQuote(reasoning)}`);
  }
  const prompt = parsed.developerInstructions.trim();
  const promptMarkdown = prompt.length > 0 ? `${prompt}
` : null;
  if (promptMarkdown !== null) {
    lines.push(`prompt_file = ${tomlQuote(".grok/prompts/lazycodex-placeholder.md")}`);
  }
  return { toml: `${lines.join("\n")}
`, promptMarkdown };
}
function writeInlinePromptRef(_prompt) {
  return ".grok/prompts/lazycodex-agent.md";
}
function appendFallbackLines(lines, override) {
  if (override === void 0) return;
  if (override.serviceTier !== void 0) {
    lines.push(`service_tier = ${tomlQuote(override.serviceTier)}`);
  }
  if (override.modelFallback !== void 0) {
    lines.push(`model_fallback = ${tomlQuote(override.modelFallback)}`);
  }
  if (override.modelFallbackReasoningLevel !== void 0) {
    lines.push(`model_fallback_reasoning_effort = ${tomlQuote(override.modelFallbackReasoningLevel)}`);
  }
  if (override.modelFallbackServiceTier !== void 0) {
    lines.push(`model_fallback_service_tier = ${tomlQuote(override.modelFallbackServiceTier)}`);
  }
}
function parseCodexAgentToml(text) {
  let description = "";
  let developerInstructions = "";
  let model = null;
  let modelReasoningEffort = null;
  let defaultCapabilityMode = null;
  const triple = '"""';
  let i = 0;
  const lines = text.split("\n");
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("developer_instructions")) {
      const after = trimmed.slice("developer_instructions".length).trim();
      if (after.startsWith("=") && after.includes(triple)) {
        const start = after.indexOf(triple);
        let body = after.slice(start + triple.length);
        i += 1;
        while (i < lines.length && !lines[i]?.includes(triple)) {
          body += `
${lines[i]}`;
          i += 1;
        }
        if (i < lines.length) {
          const endLine = lines[i] ?? "";
          const endIdx = endLine.indexOf(triple);
          if (endIdx >= 0) {
            body += `
${endLine.slice(0, endIdx)}`;
          }
        }
        developerInstructions = body.trim();
        i += 1;
        continue;
      }
    }
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const raw = trimmed.slice(eq + 1).trim();
      const value = parseTomlScalar(raw);
      if (key === "description") description = value ?? "";
      if (key === "model") model = value;
      if (key === "model_reasoning_effort") modelReasoningEffort = value;
      if (key === "default_capability_mode") defaultCapabilityMode = value;
    }
    i += 1;
  }
  if (developerInstructions.length === 0) {
    const block = extractTripleQuotedBlock(text, "developer_instructions");
    if (block !== null) developerInstructions = block;
  }
  return { description, developerInstructions, model, modelReasoningEffort, defaultCapabilityMode };
}
function extractTripleQuotedBlock(text, key) {
  const pattern = new RegExp(`${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m");
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? null;
}
function parseTomlScalar(raw) {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\"/g, '"');
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1);
  }
  return raw.length > 0 ? raw : null;
}
function tomlQuote(value) {
  return JSON.stringify(value);
}
function lazycodexModelOverrideForAgent(agentBaseName, agents) {
  if (agentBaseName === "explorer") {
    return { model: agents.explorer.model, reasoningLevel: agents.explorer.reasoningLevel };
  }
  if (agentBaseName === "reasoning") {
    return { model: agents.reasoning.model, reasoningLevel: agents.reasoning.reasoningLevel };
  }
  if (agentBaseName === "coding") {
    return { model: agents.coding.model, reasoningLevel: agents.coding.reasoningLevel };
  }
  return void 0;
}
export {
  codexAgentTomlToGrokRoleToml,
  codexAgentTomlToGrokRoleTomlWithPromptBody,
  lazycodexModelOverrideForAgent,
  renderGrokRoleTomlFromCodex,
  renderMinimalGrokRoleToml
};
