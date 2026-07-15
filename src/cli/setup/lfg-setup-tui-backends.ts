import {
  BACKEND_ROUTE_AGENT_NAMES,
  CLI_BACKENDS,
  isCliBackend,
  type BackendRoutingConfig,
  type CliBackend,
} from "../../core/lfg/backend-routing"

type BackendPrompts = {
  readonly select: (options: {
    readonly message: string
    readonly options: { value: string; label: string; hint?: string }[]
    readonly initialValue?: string
  }) => Promise<unknown>
  readonly confirm: (options: { readonly message: string; readonly initialValue?: boolean }) => Promise<unknown>
  readonly isCancel: (value: unknown) => boolean
  readonly cancel: (message: string) => void
}

export async function configureBackendRouting(
  prompts: BackendPrompts,
  initial: BackendRoutingConfig,
): Promise<BackendRoutingConfig> {
  const global = await selectBackend(prompts, "Default CLI backend for agents", initial.global)
  const customize = await prompts.confirm({
    message: "Customize per-agent CLI backends?",
    initialValue: false,
  })
  if (prompts.isCancel(customize)) return cancelled(prompts)
  if (customize !== true) return { ...initial, global }

  const agents = { ...initial.agents }
  for (const name of BACKEND_ROUTE_AGENT_NAMES) {
    agents[name] = await selectBackend(prompts, `CLI backend for ${name}`, agents[name], name)
  }
  return { version: 1, global, categories: {}, agents }
}

function backendOptions(agentName?: string): { value: CliBackend; label: string; hint: string }[] {
  return CLI_BACKENDS.map((backend) => ({
    value: backend,
    label: backend === "grok" ? "grok CLI (in-host subagent)" : "codex CLI (external)",
    hint: backend === "grok"
      ? "In-host orchestration, watching, and exploration; no product implementation"
      : "Create or attach the current project thread; falls back honestly to codex exec",
  }))
}

async function selectBackend(
  prompts: BackendPrompts,
  message: string,
  initialValue: CliBackend,
  agentName?: string,
): Promise<CliBackend> {
  const selected = await prompts.select({ message, options: backendOptions(agentName), initialValue })
  if (prompts.isCancel(selected) || !isCliBackend(selected)) return cancelled(prompts)
  return selected
}

function cancelled(prompts: BackendPrompts): never {
  prompts.cancel("lfg setup cancelled.")
  throw new Error("lfg setup cancelled")
}
