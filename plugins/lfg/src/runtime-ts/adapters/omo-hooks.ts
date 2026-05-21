export type OmoHookDefinitionLike = { name: string; originalExport: string; domain: string; status: string; standalonePackage?: string; originalSource: string; exitPath: string; targetPackage: string; wave: string; testTypes: string[]; adapterImpact: string }
export type LfgHookLifecycle = "prompting" | "model" | "tool" | "session" | "team" | "loop" | "quality" | "context" | "unknown"
export type LfgHookBehavior = { name: string; lifecycle: LfgHookLifecycle; definition: OmoHookDefinitionLike }

const FALLBACK_HOOKS: OmoHookDefinitionLike[] = [
  hook("todo-continuation-enforcer", "loop"),
  hook("keyword-detector", "prompting"),
  hook("team-mailbox-injector", "team"),
  hook("model-fallback", "model"),
]

export function listAvailableOmoHooks(): OmoHookDefinitionLike[] {
  return [...FALLBACK_HOOKS]
}

export function mapHookNameToLfgLifecycle(name: string): LfgHookLifecycle {
  if (name.includes("team")) return "team"
  if (name.includes("ralph") || name.includes("todo-continuation")) return "loop"
  if (name.includes("model") || name.includes("hephaestus") || name.includes("sisyphus-gpt") || name.includes("effort") || name.includes("think")) return "model"
  if (name.includes("tool") || name.includes("edit")) return "tool"
  if (name.includes("session") || name.includes("notification")) return "session"
  if (name.includes("comment")) return "quality"
  if (name.includes("agents") || name.includes("readme") || name.includes("rules")) return "context"
  if (name.includes("keyword") || name.includes("slash") || name.includes("usage")) return "prompting"
  return "unknown"
}

export function lookupHookBehavior(name: string): LfgHookBehavior | null {
  const definition = listAvailableOmoHooks().find((item) => item.name === name)
  return definition ? { name, lifecycle: mapHookNameToLfgLifecycle(name), definition } : null
}

function hook(name: string, domain: string): OmoHookDefinitionLike {
  return { name, originalExport: name, domain, status: "behavior-mapped", originalSource: "@oh-my-opencode/hooks-core", exitPath: "adapter-bound", targetPackage: "@oh-my-opencode/hooks-core", wave: "phase-3-orchestration", testTypes: ["unit"], adapterImpact: "low", standalonePackage: "@oh-my-opencode/hooks-core" }
}
