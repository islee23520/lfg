import * as clack from "@clack/prompts"

export const SERVICE_TIERS = [
  { value: "default", label: "default (non-fast model id)" },
  { value: "fast", label: "fast (prefer *-fast catalog id)" },
] as const

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const

export type ModelChoice = {
  readonly value: string
  readonly label: string
  readonly aliases: readonly string[]
  readonly key: string
}

export type ModelSelector = (spec: { readonly agentName?: string; readonly current: string; readonly recommended?: string; readonly choices: readonly ModelChoice[] }) => Promise<string>
export type TierSelector = (spec: { readonly agentName?: string; readonly current: string }) => Promise<string>
export type ReasoningSelector = (spec: { readonly agentName?: string; readonly current: string }) => Promise<string>

export type SetupSelectors = {
  readonly modelSelector: ModelSelector
  readonly tierSelector: TierSelector
  readonly reasoningSelector: ReasoningSelector
}

export function createSetupSelectors(prompts: typeof clack): SetupSelectors {
  return {
    modelSelector: createModelSelector(prompts),
    tierSelector: createTierSelector(prompts),
    reasoningSelector: createReasoningSelector(prompts),
  }
}

export function buildModelChoicesForTui(models: readonly string[]): readonly ModelChoice[] {
  const groups = new Map<string, string[]>()
  for (const model of models.filter(isSelectableChatModel)) {
    const key = model.split("/").at(-1) ?? model
    const aliases = groups.get(key) ?? []
    aliases.push(model)
    groups.set(key, aliases)
  }
  return [...groups.entries()].map(([key, aliases]) => {
    const unique = [...new Set(aliases)].sort((left, right) => left.localeCompare(right))
    const value = unique.find((alias) => alias === key) ?? unique.find((alias) => alias === `openai/${key}`) ?? unique[0] ?? key
    const label = unique.length === 1 ? unique[0] ?? value : `${key} (aliases: ${unique.join(", ")})`
    return { key, aliases: unique, value, label }
  }).sort((a, b) => a.label.localeCompare(b.label))
}

function isSelectableChatModel(model: string): boolean {
  return !/(^|[-_/])(image|imagine|video|embedding|embed|audio|tts|stt|whisper|moderation)([-_/]|$)/i.test(model)
}

function createModelSelector(prompts: typeof clack): ModelSelector {
  return async ({ agentName, current, recommended, choices }) => {
    const options = buildModelOptions(current, choices, recommended)
    const hasAutocomplete = typeof prompts.autocomplete === "function"
    const selected = hasAutocomplete
      ? await prompts.autocomplete({
          message: agentName ? `${agentName} model` : "Model",
          options,
          placeholder: "Type to search models...",
          initialValue: options.find((option) => option.value === current)?.value ?? options[0]?.value,
        })
      : await prompts.select({
          message: agentName ? `${agentName} model` : "Model",
          options,
          initialValue: options.find((option) => option.value === current)?.value ?? options[0]?.value,
        })
    if (prompts.isCancel(selected)) {
      prompts.cancel("lfg setup cancelled.")
      throw new Error("lfg setup cancelled")
    }
    return String(selected)
  }
}

function buildModelOptions(current: string, choices: readonly ModelChoice[], recommended?: string) {
  const options = choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    hint: modelHint(choice, current, recommended),
  }))
  return options
}

function modelHint(choice: ModelChoice, current: string, recommended?: string): string | undefined {
  const isCurrent = choice.aliases.includes(current) || choice.key === current
  const isRecommended = recommended !== undefined && (choice.aliases.includes(recommended) || choice.key === recommended)
  if (isCurrent && isRecommended) return "current, recommended"
  if (isCurrent) return "current"
  if (isRecommended) return "recommended"
  return undefined
}

function createTierSelector(prompts: typeof clack): TierSelector {
  return async ({ agentName, current }) => {
    const options = SERVICE_TIERS.map((tier) => ({
      value: tier.value,
      label: tier.label,
      hint: tier.value === current ? "current" : undefined,
    }))
    const selected = await prompts.select({
      message: agentName ? `${agentName} service tier` : "Service tier",
      options,
      initialValue: current,
    })
    if (prompts.isCancel(selected)) {
      prompts.cancel("lfg setup cancelled.")
      throw new Error("lfg setup cancelled")
    }
    return String(selected)
  }
}

function createReasoningSelector(prompts: typeof clack): ReasoningSelector {
  return async ({ agentName, current }) => {
    const options = REASONING_EFFORTS.map((effort) => ({
      value: effort,
      label: effort,
      hint: effort === current ? "current" : undefined,
    }))
    const selected = await prompts.select({
      message: agentName ? `${agentName} reasoning effort` : "Reasoning effort",
      options,
      initialValue: current,
    })
    if (prompts.isCancel(selected)) {
      prompts.cancel("lfg setup cancelled.")
      throw new Error("lfg setup cancelled")
    }
    return String(selected)
  }
}
