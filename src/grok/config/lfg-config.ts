import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import type { LazycodexAgentConfig, ReasoningLevel } from "../../cli/models/lfg-models"
import type { LazycodexAgentModelOverride, LazycodexAgentOverrideMap } from "../agents/lazycodex-agent-overrides"
import { stripJsonComments } from "./json-comments"
import { lfgRuntimeConfigPath, renderDefaultLfgRuntimeConfig } from "../models/lfg-runtime-config"
export { applyLfgRuntimeConfigToAgentOverrides, lfgRuntimeConfigPath, readLfgRuntimeConfigFile } from "../models/lfg-runtime-config"

const ReasoningLevelSchema = z.union([z.literal("low"), z.literal("medium"), z.literal("high"), z.literal("xhigh")])

const AgentConfigSchema = z
  .object({
    model: z.string().min(1).optional(),
    reasoning_level: ReasoningLevelSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

export const LfgConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1).default(1),
    models: z
      .object({
        default: z.string().min(1).optional(),
        fast: z.string().min(1).optional(),
        reasoning: z.string().min(1).optional(),
        coding: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    agents: z.record(z.string(), AgentConfigSchema).optional(),
    subagents: z
      .object({
        disableBuiltins: z.boolean().default(true),
        enabled: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type LfgConfig = z.infer<typeof LfgConfigSchema>

export const LFG_CONFIG_FILENAME = "lfg-config.jsonc" as const
export const LFG_CONFIG_SCHEMA_FILENAME = "lfg-config.schema.json" as const

export function lfgConfigPath(home: string): string {
  return join(home, ".grok", LFG_CONFIG_FILENAME)
}

export function lfgConfigSchemaPath(home: string): string {
  return join(home, ".grok", LFG_CONFIG_SCHEMA_FILENAME)
}

export async function readLfgConfigFile(home: string): Promise<LfgConfig | null> {
  try {
    const raw = await readFile(lfgConfigPath(home), "utf8")
    return LfgConfigSchema.parse(JSON.parse(stripJsonComments(raw)))
  } catch {
    return null
  }
}

export async function ensureLfgConfigFiles(
  home: string,
  seed: LazycodexAgentOverrideMap,
): Promise<{ readonly configPath: string; readonly schemaPath: string; readonly runtimeConfigPath: string }> {
  const configPath = lfgConfigPath(home)
  const runtimeConfigPath = lfgRuntimeConfigPath(home)
  const schemaPath = lfgConfigSchemaPath(home)
  await mkdir(join(home, ".grok"), { recursive: true })
  await writeFile(schemaPath, `${JSON.stringify(z.toJSONSchema(LfgConfigSchema), null, 2)}\n`, "utf8")
  await writeFile(runtimeConfigPath, renderDefaultLfgRuntimeConfig(seed), "utf8")
  try {
    await readFile(configPath, "utf8")
  } catch {
    await writeFile(configPath, renderDefaultLfgConfig(seed), "utf8")
  }
  return { configPath, schemaPath, runtimeConfigPath }
}

export function applyLfgConfigToAgentOverrides(
  base: LazycodexAgentOverrideMap,
  roleConfig: LazycodexAgentConfig,
  config: LfgConfig | null,
): LazycodexAgentOverrideMap {
  const merged: Record<string, LazycodexAgentModelOverride> = { ...base }
  for (const [name, agent] of Object.entries(config?.agents ?? {})) {
    const existing = merged[name] ?? agentFallback(name, roleConfig)
    const model = agent.model ?? existing?.model
    const reasoningLevel = agent.reasoning_level ?? existing?.reasoningLevel
    if (model !== undefined && reasoningLevel !== undefined) {
      merged[name] = {
        model,
        reasoningLevel,
        ...(existing?.serviceTier !== undefined ? { serviceTier: existing.serviceTier } : {}),
        ...(existing?.modelFallback !== undefined ? { modelFallback: existing.modelFallback } : {}),
        ...(existing?.modelFallbackReasoningLevel !== undefined ? { modelFallbackReasoningLevel: existing.modelFallbackReasoningLevel } : {}),
        ...(existing?.modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier: existing.modelFallbackServiceTier } : {}),
      }
    }
  }
  return merged
}

function agentFallback(name: string, roleConfig: LazycodexAgentConfig): { readonly model: string; readonly reasoningLevel: ReasoningLevel } | undefined {
  if (name === "explorer") return roleConfig.explorer
  if (name === "reasoning") return roleConfig.reasoning
  if (name === "coding") return roleConfig.coding
  return undefined
}

function renderDefaultLfgConfig(seed: LazycodexAgentOverrideMap): string {
  const agents = Object.fromEntries(
    Object.entries(seed).map(([name, value]) => [
      name,
      {
        model: value.model,
        reasoning_level: value.reasoningLevel,
        enabled: true,
        ...(value.serviceTier !== undefined ? { service_tier: value.serviceTier } : {}),
        ...(value.modelFallback !== undefined ? { model_fallback: value.modelFallback } : {}),
      },
    ]),
  )
  return `${JSON.stringify({ $schema: `./${LFG_CONFIG_SCHEMA_FILENAME}`, version: 1, agents, subagents: { disableBuiltins: true } }, null, 2)}\n`
}
