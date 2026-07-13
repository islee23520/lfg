import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  readOmoAgentOverridesFile,
  writeOmoAgentOverridesFile,
  type LazycodexAgentModelOverride,
  type LazycodexAgentOverrideMap,
  type ServiceTier,
} from "../../grok/agents/lazycodex-agent-overrides"
import { resolveModelForServiceTier } from "./resolve-tier-model"

export type ApplyAgentServiceTierArgs = {
  readonly home: string
  readonly agent: string
  readonly tier: ServiceTier
  readonly modelIds?: readonly string[]
  readonly mapping?: { readonly default?: string; readonly fast?: string }
}

export type ApplyAgentServiceTierResult = {
  readonly agent: string
  readonly tier: ServiceTier
  readonly fromModel: string
  readonly toModel: string
  readonly rolePath: string
  readonly overridesPath: string
  readonly routing: "model-id"
  readonly note: string
}

export async function applyAgentServiceTier(args: ApplyAgentServiceTierArgs): Promise<ApplyAgentServiceTierResult> {
  const agent = args.agent.trim()
  if (agent.length === 0) {
    throw new Error("agent name is required")
  }

  const rolePath = join(args.home, ".grok", "roles", `${agent}.toml`)
  let roleText: string
  try {
    roleText = await readFile(rolePath, "utf8")
  } catch {
    throw new Error(`missing role TOML for agent "${agent}": ${rolePath}`)
  }

  const fromModel = extractTomlStringField(roleText, "model")
  if (fromModel === null || fromModel.length === 0) {
    throw new Error(`role TOML for agent "${agent}" has no model field: ${rolePath}`)
  }

  const modelIds = seedSiblingModelIds(args.modelIds ?? [], fromModel)
  const toModel = resolveModelForServiceTier(modelIds, fromModel, args.tier, {
    mappingFast: args.mapping?.fast,
    mappingDefault: args.mapping?.default,
  })

  const nextRole = stripServiceTierLines(rewriteTomlStringField(roleText, "model", toModel))
  await writeFile(rolePath, nextRole, "utf8")

  const reasoningLevel = extractTomlStringField(roleText, "reasoning_effort") ?? "medium"
  const overridesPath = await upsertAgentOverrideTier({
    home: args.home,
    agent,
    model: toModel,
    tier: args.tier,
    reasoningLevel: isReasoningLevel(reasoningLevel) ? reasoningLevel : "medium",
  })

  return {
    agent,
    tier: args.tier,
    fromModel,
    toModel,
    rolePath,
    overridesPath,
    routing: "model-id",
    note: "Grok routes by model id; service_tier is metadata only and is not written into role TOML.",
  }
}

async function upsertAgentOverrideTier(args: {
  readonly home: string
  readonly agent: string
  readonly model: string
  readonly tier: ServiceTier
  readonly reasoningLevel: LazycodexAgentModelOverride["reasoningLevel"]
}): Promise<string> {
  const existing = await readOmoAgentOverridesFile(args.home)
  const previous = existing[args.agent]
  const next: LazycodexAgentOverrideMap = {
    ...existing,
    [args.agent]: {
      model: args.model,
      reasoningLevel: previous?.reasoningLevel ?? args.reasoningLevel,
      serviceTier: args.tier,
      ...(previous?.modelFallback !== undefined ? { modelFallback: previous.modelFallback } : {}),
      ...(previous?.modelFallbackReasoningLevel !== undefined
        ? { modelFallbackReasoningLevel: previous.modelFallbackReasoningLevel }
        : {}),
      ...(previous?.modelFallbackServiceTier !== undefined
        ? { modelFallbackServiceTier: previous.modelFallbackServiceTier }
        : {}),
      ...(previous?.roleRationale !== undefined ? { roleRationale: previous.roleRationale } : {}),
    },
  }
  return writeOmoAgentOverridesFile(args.home, next)
}

function extractTomlStringField(text: string, field: string): string | null {
  const match = text.match(new RegExp(`^${field}\\s*=\\s*"([^"]*)"\\s*$`, "m"))
  return match?.[1] ?? null
}

function rewriteTomlStringField(text: string, field: string, value: string): string {
  const re = new RegExp(`^${field}\\s*=\\s*"[^"]*"\\s*$`, "m")
  if (re.test(text)) {
    return text.replace(re, `${field} = "${value}"`)
  }
  const trimmed = text.endsWith("\n") ? text : `${text}\n`
  return `${trimmed}${field} = "${value}"\n`
}

function stripServiceTierLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*service_tier\s*=/.test(line))
    .join("\n")
}

function isReasoningLevel(value: unknown): value is LazycodexAgentModelOverride["reasoningLevel"] {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
}

/** When no discovery catalog is available, still allow deterministic *-fast sibling flips. */
function seedSiblingModelIds(modelIds: readonly string[], currentModel: string): readonly string[] {
  const ids = new Set(modelIds.filter((id) => id.length > 0))
  ids.add(currentModel)
  if (currentModel.endsWith("-fast")) {
    const base = currentModel.slice(0, -"-fast".length)
    if (base.length > 0) ids.add(base)
  } else {
    ids.add(`${currentModel}-fast`)
  }
  return [...ids]
}
