import type { LazycodexAgentConfig } from "../../cli/models/lfg-models"
import type { LazycodexAgentModelOverride } from "./lazycodex-agent-overrides"
import { isReadOnlyNativeAgent, nativeAgentCapabilityMode } from "./native-agent-permissions"
import { nativeAgentDescription } from "./native-omo-agents"

const READ_ONLY_AGENT_NAMES = new Set([
  "sisyphus",
  "watcher",
  "explorer",
  "plan",
  "librarian",
  "metis",
  "momus",
  "codex-ultrawork-reviewer",
])

export type RenderedGrokRole = {
  readonly toml: string
  readonly promptPath: string | null
  readonly promptBody: string | null
}

/** Convert lazycodex Codex agent TOML to Grok role TOML + prompt markdown file. */
export function renderGrokRoleTomlFromCodex(
  codexToml: string,
  agentBaseName: string,
  modelOverride: LazycodexAgentModelOverride | undefined,
  promptsDir: string,
): RenderedGrokRole {
  const parsed = parseCodexAgentToml(codexToml)
  const model = modelOverride?.model ?? parsed.model
  const reasoning = modelOverride?.reasoningLevel ?? parsed.modelReasoningEffort
  const lines: string[] = []
  if (parsed.description.length > 0) {
    lines.push(`description = ${tomlQuote(parsed.description)}`)
  }
  const capability =
    parsed.defaultCapabilityMode ??
    nativeAgentCapabilityMode(agentBaseName) ??
    (READ_ONLY_AGENT_NAMES.has(agentBaseName) || isReadOnlyNativeAgent(agentBaseName) ? "read-only" : null)
  if (capability !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(capability)}`)
  }
  if (model !== null && model.length > 0) {
    lines.push(`model = ${tomlQuote(model)}`)
  }
  if (reasoning !== null && reasoning.length > 0) {
    lines.push(`reasoning_effort = ${tomlQuote(reasoning)}`)
  }
  appendFallbackLines(lines, modelOverride)
  const prompt = parsed.developerInstructions.trim()
  let promptPath: string | null = null
  let promptBody: string | null = null
  if (prompt.length > 0) {
    promptPath = `${promptsDir}/${agentBaseName}.md`
    promptBody = `${prompt}\n`
    lines.push(`prompt_file = ${tomlQuote(promptPath)}`)
  }
  return { toml: `${lines.join("\n")}\n`, promptPath, promptBody }
}

export function renderMinimalGrokRoleToml(
  agentName: string,
  override: LazycodexAgentModelOverride,
  promptPath?: string,
): string {
  const lines = [
    `description = ${tomlQuote(nativeAgentDescription(agentName))}`,
  ]
  const capability = nativeAgentCapabilityMode(agentName)
  if (capability !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(capability)}`)
  } else if (READ_ONLY_AGENT_NAMES.has(agentName) || isReadOnlyNativeAgent(agentName)) {
    lines.push(`default_capability_mode = ${tomlQuote("read-only")}`)
  }
  lines.push(`model = ${tomlQuote(override.model)}`)
  lines.push(`reasoning_effort = ${tomlQuote(override.reasoningLevel)}`)
  appendFallbackLines(lines, override)
  if (promptPath !== undefined) {
    lines.push(`prompt_file = ${tomlQuote(promptPath)}`)
  }
  return `${lines.join("\n")}\n`
}

/** Strip Codex-only fields; map model_reasoning_effort → reasoning_effort for Grok role TOMLs. */
export function codexAgentTomlToGrokRoleToml(codexToml: string, modelOverride?: { readonly model?: string; readonly reasoningLevel?: string }): string {
  const parsed = parseCodexAgentToml(codexToml)
  const model = modelOverride?.model ?? parsed.model
  const reasoning = modelOverride?.reasoningLevel ?? parsed.modelReasoningEffort
  const lines: string[] = []
  if (parsed.description.length > 0) {
    lines.push(`description = ${tomlQuote(parsed.description)}`)
  }
  if (parsed.defaultCapabilityMode !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(parsed.defaultCapabilityMode)}`)
  }
  if (model !== null && model.length > 0) {
    lines.push(`model = ${tomlQuote(model)}`)
  }
  if (reasoning !== null && reasoning.length > 0) {
    lines.push(`reasoning_effort = ${tomlQuote(reasoning)}`)
  }
  const prompt = parsed.developerInstructions.trim()
  if (prompt.length > 0) {
    lines.push(`prompt_file = ${tomlQuote(writeInlinePromptRef(prompt))}`)
  }
  return `${lines.join("\n")}\n`
}

/** Grok roles use prompt_file; inline multiline instructions become a sibling .md path marker we embed as instructions_file-style content in TOML. */
export function codexAgentTomlToGrokRoleTomlWithPromptBody(
  codexToml: string,
  modelOverride?: { readonly model?: string; readonly reasoningLevel?: string },
): { readonly toml: string; readonly promptMarkdown: string | null } {
  const parsed = parseCodexAgentToml(codexToml)
  const model = modelOverride?.model ?? parsed.model
  const reasoning = modelOverride?.reasoningLevel ?? parsed.modelReasoningEffort
  const lines: string[] = []
  if (parsed.description.length > 0) {
    lines.push(`description = ${tomlQuote(parsed.description)}`)
  }
  if (parsed.defaultCapabilityMode !== null) {
    lines.push(`default_capability_mode = ${tomlQuote(parsed.defaultCapabilityMode)}`)
  }
  if (model !== null && model.length > 0) {
    lines.push(`model = ${tomlQuote(model)}`)
  }
  if (reasoning !== null && reasoning.length > 0) {
    lines.push(`reasoning_effort = ${tomlQuote(reasoning)}`)
  }
  const prompt = parsed.developerInstructions.trim()
  const promptMarkdown = prompt.length > 0 ? `${prompt}\n` : null
  if (promptMarkdown !== null) {
    lines.push(`prompt_file = ${tomlQuote(".grok/prompts/lazycodex-placeholder.md")}`)
  }
  return { toml: `${lines.join("\n")}\n`, promptMarkdown }
}

function writeInlinePromptRef(_prompt: string): string {
  return ".grok/prompts/lazycodex-agent.md"
}

/** Append fallback fields from an override to a Grok role TOML. Fast tier is represented by the selected model alias/id, not service_tier. */
function appendFallbackLines(lines: string[], override: { readonly serviceTier?: string; readonly modelFallback?: string; readonly modelFallbackReasoningLevel?: string; readonly modelFallbackServiceTier?: string } | undefined): void {
  if (override === undefined) return
  if (override.modelFallback !== undefined) {
    lines.push(`model_fallback = ${tomlQuote(override.modelFallback)}`)
  }
  if (override.modelFallbackReasoningLevel !== undefined) {
    lines.push(`model_fallback_reasoning_effort = ${tomlQuote(override.modelFallbackReasoningLevel)}`)
  }
}

type ParsedCodexAgent = {
  readonly description: string
  readonly developerInstructions: string
  readonly model: string | null
  readonly modelReasoningEffort: string | null
  readonly defaultCapabilityMode: string | null
}

function parseCodexAgentToml(text: string): ParsedCodexAgent {
  let description = ""
  let developerInstructions = ""
  let model: string | null = null
  let modelReasoningEffort: string | null = null
  let defaultCapabilityMode: string | null = null
  const triple = '"""'
  let i = 0
  const lines = text.split("\n")
  while (i < lines.length) {
    const line = lines[i] ?? ""
    const trimmed = line.trim()
    if (trimmed.startsWith("developer_instructions")) {
      const after = trimmed.slice("developer_instructions".length).trim()
      if (after.startsWith("=") && after.includes(triple)) {
        const start = after.indexOf(triple)
        let body = after.slice(start + triple.length)
        i += 1
        while (i < lines.length && !lines[i]?.includes(triple)) {
          body += `\n${lines[i]}`
          i += 1
        }
        if (i < lines.length) {
          const endLine = lines[i] ?? ""
          const endIdx = endLine.indexOf(triple)
          if (endIdx >= 0) {
            body += `\n${endLine.slice(0, endIdx)}`
          }
        }
        developerInstructions = body.trim()
        i += 1
        continue
      }
    }
    const eq = trimmed.indexOf("=")
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim()
      const raw = trimmed.slice(eq + 1).trim()
      const value = parseTomlScalar(raw)
      if (key === "description") description = value ?? ""
      if (key === "model") model = value
      if (key === "model_reasoning_effort") modelReasoningEffort = value
      if (key === "default_capability_mode") defaultCapabilityMode = value
    }
    i += 1
  }
  if (developerInstructions.length === 0) {
    const block = extractTripleQuotedBlock(text, "developer_instructions")
    if (block !== null) developerInstructions = block
  }
  return { description, developerInstructions, model, modelReasoningEffort, defaultCapabilityMode }
}

function extractTripleQuotedBlock(text: string, key: string): string | null {
  const pattern = new RegExp(`${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m")
  const match = pattern.exec(text)
  return match?.[1]?.trim() ?? null
}

function parseTomlScalar(raw: string): string | null {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\"/g, '"')
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1)
  }
  return raw.length > 0 ? raw : null
}

function tomlQuote(value: string): string {
  return JSON.stringify(value)
}

/** Model overrides for omo agent names after Grok sync. */
export function lazycodexModelOverrideForAgent(
  agentBaseName: string,
  agents: LazycodexAgentConfig,
): { readonly model?: string; readonly reasoningLevel?: string } | undefined {
  if (agentBaseName === "explorer") {
    return { model: agents.explorer.model, reasoningLevel: agents.explorer.reasoningLevel }
  }
  if (agentBaseName === "reasoning") {
    return { model: agents.reasoning.model, reasoningLevel: agents.reasoning.reasoningLevel }
  }
  if (agentBaseName === "coding") {
    return { model: agents.coding.model, reasoningLevel: agents.coding.reasoningLevel }
  }
  return undefined
}
