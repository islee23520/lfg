import { resolveVariant, type VariantTable, type LoadedPrompt, type SyncRuntimeInjection } from "./prompts-core-vendored/index"
import { loadPromptSync } from "./prompts-core-vendored/loader"
import {
  atlasPromptVariants,
  prometheusPromptVariants,
  ultraworkPromptVariants,
  codexUltraworkPromptVariants,
  HYPERPLAN_MODE_PROMPT,
  TEAM_MODE_PROMPT,
} from "./prompts-core-vendored/index"

export type AgentPromptName = "atlas" | "prometheus" | "ultrawork" | "codex-ultrawork"

export type ResolveGrokPromptInput = {
  readonly agent: AgentPromptName
  readonly modelID?: string
  readonly inject?: readonly SyncRuntimeInjection[]
}

const AGENT_VARIANT_TABLES: Readonly<Record<AgentPromptName, VariantTable>> = {
  atlas: atlasPromptVariants,
  prometheus: prometheusPromptVariants,
  ultrawork: ultraworkPromptVariants,
  "codex-ultrawork": codexUltraworkPromptVariants,
}

/**
 * Resolves the best prompt variant for a Grok session, then loads the bundled
 * prompt content. Grok models (grok-4, grok-4-fast, etc.) don't match any
 * upstream family detector, so they fall through to the "default" variant —
 * which is the intended GrokBuild behavior (Grok uses the model-neutral default
 * prompt rather than a model-specific calibration).
 */
export function resolveGrokAgentPrompt(input: ResolveGrokPromptInput): LoadedPrompt {
  const variants = AGENT_VARIANT_TABLES[input.agent]
  const variant = resolveVariant({
    modelID: input.modelID,
    agentName: input.agent === "prometheus" ? "prometheus" : undefined,
    variants,
  })

  const source = variants[variant]
  if (!source) {
    throw new Error(`No prompt variant "${variant}" for agent "${input.agent}"`)
  }

  if (source.kind !== "bundled") {
    throw new Error(`Expected bundled prompt source for agent "${input.agent}" variant "${variant}"`)
  }

  return loadPromptSync({
    source,
    name: input.agent,
    variant,
    inject: input.inject,
  })
}

export { HYPERPLAN_MODE_PROMPT, TEAM_MODE_PROMPT }
