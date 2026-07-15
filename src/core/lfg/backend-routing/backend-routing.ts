export const CLI_BACKENDS = ["grok", "codex"] as const
export type CliBackend = (typeof CLI_BACKENDS)[number]
export const DEFAULT_CLI_BACKEND: CliBackend = "grok"

export const BACKEND_ROUTE_CATEGORY_NAMES = [] as const

export const BACKEND_ROUTE_AGENT_NAMES = [
  "sisyphus",
  "watcher",
  "explorer",
  "git-master",
] as const

export type BackendRouteCategoryName = (typeof BACKEND_ROUTE_CATEGORY_NAMES)[number]
export type BackendRouteAgentName = (typeof BACKEND_ROUTE_AGENT_NAMES)[number]

export type BackendRoutingConfig = {
  readonly version: 1
  readonly global: CliBackend
  readonly categories: Readonly<Partial<Record<string, CliBackend>>>
  readonly agents: Readonly<Record<BackendRouteAgentName, CliBackend>>
}

export type BackendRouteInput = {
  readonly agent: string
  readonly category?: string
  readonly explicitBackend?: CliBackend
}

export type ResolvedBackendRoute = {
  readonly backend: CliBackend
  readonly source: "explicit" | "agent" | "category" | "global"
  readonly transport: "in-host-subagent" | "external-cli"
}

const DEFAULT_CATEGORY_BACKENDS: Readonly<Partial<Record<string, CliBackend>>> = {}

const DEFAULT_AGENT_BACKENDS: Readonly<Record<BackendRouteAgentName, CliBackend>> = {
  sisyphus: "grok",
  watcher: "grok",
  explorer: "grok",
  "git-master": "grok",
}

export function isCliBackend(value: unknown): value is CliBackend {
  return typeof value === "string" && (CLI_BACKENDS as readonly string[]).includes(value)
}

export function normalizeCliBackend(value: unknown): CliBackend | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "gpt" || normalized === "claude" || normalized === "agy" || normalized === "gemini") return "codex"
  return isCliBackend(normalized) ? normalized : null
}

export function cliBackendSelectionJson(selected: CliBackend): {
  readonly selected: CliBackend
  readonly default: CliBackend
  readonly supported: readonly CliBackend[]
} {
  return { selected, default: DEFAULT_CLI_BACKEND, supported: [...CLI_BACKENDS] }
}

export function defaultBackendRoutingConfig(): BackendRoutingConfig {
  return {
    version: 1,
    global: DEFAULT_CLI_BACKEND,
    categories: { ...DEFAULT_CATEGORY_BACKENDS },
    agents: { ...DEFAULT_AGENT_BACKENDS },
  }
}

export function resolveBackendRoute(config: BackendRoutingConfig, input: BackendRouteInput): ResolvedBackendRoute {
  if (input.explicitBackend !== undefined) return resolved(input.explicitBackend, "explicit")
  if (isBackendRouteAgentName(input.agent)) return resolved(config.agents[input.agent], "agent")
  if (input.category !== undefined && isBackendRouteCategoryName(input.category)) {
    const categoryBackend = config.categories[input.category]
    if (categoryBackend !== undefined) return resolved(categoryBackend, "category")
  }
  return resolved(config.global, "global")
}

export function isBackendRouteAgentName(value: string): value is BackendRouteAgentName {
  return (BACKEND_ROUTE_AGENT_NAMES as readonly string[]).includes(value)
}

export function isBackendRouteCategoryName(value: string): value is BackendRouteCategoryName {
  return (BACKEND_ROUTE_CATEGORY_NAMES as readonly string[]).includes(value)
}

function resolved(backend: CliBackend, source: ResolvedBackendRoute["source"]): ResolvedBackendRoute {
  return { backend, source, transport: backend === "grok" ? "in-host-subagent" : "external-cli" }
}
