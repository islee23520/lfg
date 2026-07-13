export const SERVICE_TIERS = [
  { value: "default", label: "default (non-fast model id; Grok routes by model id)" },
  { value: "fast", label: "fast (prefer catalog *-fast model id)" },
] as const

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const

export const BACK_SELECTION = "__lfg_back__" as const

export type PromptOutput = {
  readonly write?: (chunk: string) => void
  readonly log?: (...args: unknown[]) => void
}

export type AgentGuideCurrent = {
  readonly model?: string
  readonly reasoning?: string
  readonly tier?: string
}

export type AgentGuideOptions = {
  readonly preferCurrent?: boolean
  readonly recommended?: string
  readonly rationale?: string
  readonly alternatives?: readonly string[]
  readonly perfLine?: string
}

function emit(output: PromptOutput | undefined, line: string): void {
  if (typeof output?.write === "function") {
    output.write(line.endsWith("\n") ? line : `${line}\n`)
    return
  }
  if (typeof output?.log === "function") {
    output.log(line)
  }
}

export function logAgentGuide(
  output: PromptOutput | undefined,
  agentName: string | undefined,
  current: AgentGuideCurrent,
  options: AgentGuideOptions = {},
): void {
  if (agentName) emit(output, `Agent: ${agentName}`)
  emit(
    output,
    `  Current: ${current.model ?? "unknown"} (reasoning: ${current.reasoning ?? "unset"}, tier: ${current.tier ?? "unset"})`,
  )
  if (options.preferCurrent === true) {
    emit(output, "  Default: keep the current OMO/Grok value; press Enter to leave it unchanged.")
    return
  }
  if (options.recommended) {
    const perf = options.perfLine ? ` ${options.perfLine}` : ""
    emit(output, `  Recommended: ${options.recommended}${perf}`)
    if (options.rationale) emit(output, `  Why: ${options.rationale}`)
    if (options.alternatives && options.alternatives.length > 0) {
      emit(output, `  Alternatives: ${options.alternatives.join(", ")}`)
    }
    emit(output, "  Press Enter to keep the recommended model.")
    return
  }
  emit(output, "  Guide: no preset — choose a model from the list (or press Enter to keep current).")
}

export function printModelChoices(models: readonly string[], output?: PromptOutput): void {
  const choices = groupModelAliases(models)
  for (const [index, choice] of choices.entries()) {
    const label =
      choice.aliases.length === 1 ? choice.aliases[0] : `${choice.key} (aliases: ${choice.aliases.join(", ")})`
    emit(output, `  ${index + 1}) ${label}`)
  }
}

export function parseListedSelection(answer: string, values: readonly string[]): string | typeof BACK_SELECTION | null {
  const trimmed = answer.trim()
  if (trimmed === "") return null
  if (isBackAnswer(trimmed)) return BACK_SELECTION
  const asIndex = Number.parseInt(trimmed, 10)
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= values.length) {
    return values[asIndex - 1]!
  }
  const exact = values.find((value) => value === trimmed || value.endsWith(`/${trimmed}`))
  return exact ?? null
}

export function groupModelAliases(models: readonly string[]): readonly {
  readonly key: string
  readonly aliases: readonly string[]
}[] {
  const byKey = new Map<string, string[]>()
  for (const model of models) {
    const key = bareModelId(model)
    const list = byKey.get(key) ?? []
    list.push(model)
    byKey.set(key, list)
  }
  return [...byKey.entries()].map(([key, aliases]) => ({ key, aliases: aliases.slice().sort() }))
}

export type LineReaderLike = {
  readonly question?: (prompt: string) => Promise<string>
}

export async function promptForYesNo(
  rl: LineReaderLike | null | undefined,
  question: string,
  options: {
    readonly yesNoSelector?: (args: { readonly question: string }) => Promise<boolean>
  } = {},
): Promise<boolean> {
  if (typeof options.yesNoSelector === "function") {
    return !!(await options.yesNoSelector({ question }))
  }
  if (!rl || typeof rl.question !== "function") return false
  const answer = await rl.question(question)
  return /^y(?:es)?$/i.test(String(answer).trim())
}

export async function promptForModel(
  rl: LineReaderLike | null | undefined,
  models: readonly string[],
  options: {
    readonly output?: PromptOutput
    readonly current?: string
    readonly recommended?: string
    readonly modelSelector?: (args: {
      readonly models: readonly string[]
      readonly current?: string
      readonly recommended?: string
    }) => Promise<string | typeof BACK_SELECTION | null>
  } = {},
): Promise<string | typeof BACK_SELECTION | null> {
  if (typeof options.modelSelector === "function") {
    return options.modelSelector({
      models,
      current: options.current,
      recommended: options.recommended,
    })
  }
  printModelChoices(models, options.output)
  if (!rl || typeof rl.question !== "function") {
    return options.recommended ?? options.current ?? models[0] ?? null
  }
  const answer = await rl.question(
    options.recommended
      ? `Model [Enter=${options.recommended}]: `
      : options.current
        ? `Model [Enter=${options.current}]: `
        : "Model: ",
  )
  if (answer.trim() === "") {
    return options.recommended ?? options.current ?? null
  }
  const flat = groupModelAliases(models).flatMap((c) => c.aliases)
  return parseListedSelection(answer, flat.length > 0 ? flat : models)
}

export async function promptForServiceTier(
  rl: LineReaderLike | null | undefined,
  options: {
    readonly output?: PromptOutput
    readonly current?: string
    readonly tierSelector?: (args: { readonly current?: string }) => Promise<string | typeof BACK_SELECTION | null>
  } = {},
): Promise<string | typeof BACK_SELECTION | null> {
  if (typeof options.tierSelector === "function") {
    return options.tierSelector({ current: options.current })
  }
  for (const [index, tier] of SERVICE_TIERS.entries()) {
    emit(options.output, `  ${index + 1}) ${tier.label}`)
  }
  if (!rl || typeof rl.question !== "function") return options.current ?? "default"
  const answer = await rl.question(
    options.current
      ? `Model-id tier (Grok routes by model id) [Enter=${options.current}]: `
      : "Model-id tier (Grok routes by model id): ",
  )
  if (answer.trim() === "") return options.current ?? "default"
  const values = SERVICE_TIERS.map((t) => t.value)
  return parseListedSelection(answer, values)
}

export async function promptForReasoningEffort(
  rl: LineReaderLike | null | undefined,
  options: {
    readonly output?: PromptOutput
    readonly current?: string
    readonly reasoningSelector?: (args: {
      readonly current?: string
    }) => Promise<string | typeof BACK_SELECTION | null>
  } = {},
): Promise<string | typeof BACK_SELECTION | null> {
  if (typeof options.reasoningSelector === "function") {
    return options.reasoningSelector({ current: options.current })
  }
  for (const [index, effort] of REASONING_EFFORTS.entries()) {
    emit(options.output, `  ${index + 1}) ${effort}`)
  }
  if (!rl || typeof rl.question !== "function") return options.current ?? "medium"
  const answer = await rl.question(
    options.current ? `Reasoning effort [Enter=${options.current}]: ` : "Reasoning effort: ",
  )
  if (answer.trim() === "") return options.current ?? "medium"
  return parseListedSelection(answer, REASONING_EFFORTS)
}

function bareModelId(model: string): string {
  const slash = model.lastIndexOf("/")
  return slash >= 0 ? model.slice(slash + 1) : model
}

function isBackAnswer(answer: string): boolean {
  return ["b", "back", ":back", "previous"].includes(answer.trim().toLowerCase())
}
