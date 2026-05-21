import { join } from "node:path"
import { loadOmoAgentRegistry, type OmoAgent } from "../services/agent-registry"
import { OMO_CATEGORY_MIGRATION_NOTES, OMO_CATEGORY_MODEL_PROFILES, OMO_LFG_SUPPORTED_CATEGORY_NAMES, OMO_MODEL_MATCHING_SOURCE, OMO_ROLE_FIT_POLICIES, OMO_UPSTREAM_CATEGORY_NAMES, resolveModelProfile, type ResolveOmoModelProfileOptions } from "../services/model-resolution"
import { commandEnv, type CommandContext, type JsonObject } from "./common"

export type AgentsListOptions = { ids?: boolean; json?: boolean }
export type AgentsInspectOptions = ResolveOmoModelProfileOptions & { agentId: string }

export function categoryRouteCatalog(): JsonObject {
  return { upstreamCategories: [...OMO_UPSTREAM_CATEGORY_NAMES], supportedCategories: [...OMO_LFG_SUPPORTED_CATEGORY_NAMES], migrationNotes: { ...OMO_CATEGORY_MIGRATION_NOTES } }
}

export async function agentsList(options: AgentsListOptions = {}, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const agents = await loadOmoAgentRegistry(join(env.root, "src", "agents"))
  if (options.ids) {
    const ids = agents.map((agent) => agent.id)
    return { ok: true, ids, count: ids.length, ...(options.json ? {} : { _raw_text: ids.join("\n") }) }
  }
  return { ok: true, status: "ok", agents, count: agents.length, categoryModelProfiles: OMO_CATEGORY_MODEL_PROFILES, categoryRouting: categoryRouteCatalog(), modelMatchingSource: OMO_MODEL_MATCHING_SOURCE, roleFitPolicies: OMO_ROLE_FIT_POLICIES }
}

export async function agentsInspect(options: AgentsInspectOptions, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const agents = await loadOmoAgentRegistry(join(env.root, "src", "agents"))
  const agent = agents.find((candidate) => candidate.id === options.agentId)
  if (!agent) return { ok: false, error: `unknown agent: '${options.agentId}'`, known: agents.map((candidate) => candidate.id).sort() }
  const resolved = resolveModelProfile(agent, { category: options.category, provider: options.provider, model: options.model, reasoning: options.reasoning })
  if (!resolved.ok) return resolved
  return { ok: true, agent: withResolvedProfile(agent, resolved.modelProfile), resolvedModelProfile: resolved.modelProfile, modelResolution: resolved.modelResolution, categoryRouting: categoryRouteCatalog() }
}

function withResolvedProfile(agent: OmoAgent, modelProfile: OmoAgent["modelProfile"]): OmoAgent {
  return { ...agent, modelProfile }
}
