import { join } from "node:path"
import { resolveLfgEnv, type LfgEnv } from "../foundation/env"
import { loadOmoAgentRegistry } from "../services/agent-registry"
import { OMO_CATEGORY_MIGRATION_NOTES, OMO_CATEGORY_MODEL_PROFILES, OMO_LFG_SUPPORTED_CATEGORY_NAMES, OMO_UPSTREAM_CATEGORY_NAMES, resolveModelProfile } from "../services/model-resolution"

export type RouteCommandInput = { category?: string; subagentType?: string; subagent_type?: string; task?: string }

export async function routeCommand(input: RouteCommandInput, env: LfgEnv = resolveLfgEnv()): Promise<Record<string, unknown>> {
  const category = input.category || undefined
  const subagentType = input.subagentType ?? input.subagent_type
  const registry = await loadOmoAgentRegistry(join(env.root, "src", "agents"))
  const byId = new Map(registry.map((agent) => [agent.id, agent]))
  if (category && subagentType) return { ok: false, status: "blocked", error: "category and subagent_type are mutually exclusive", category, subagent_type: subagentType, migrationNote: "task(category=...) routes to Sisyphus-Junior; supply only category or subagent_type in a single request.", categoryRouting: categoryRouteCatalog() }
  if (!category && !subagentType) return { ok: false, status: "blocked", error: "either category or subagent_type is required", categoryRouting: categoryRouteCatalog() }
  if (category) {
    const junior = byId.get("sisyphus-junior")
    if (!junior) return { ok: false, status: "blocked", error: "unknown subagent_type", subagent_type: "sisyphus-junior", known: registry.map((agent) => agent.id).sort(), categoryRouting: categoryRouteCatalog() }
    const resolved = resolveModelProfile(junior, { category })
    if (!resolved.ok) return { ...resolved, status: resolved.status ?? "blocked", routeKind: "category", categoryRouting: categoryRouteCatalog(), selectedAgent: selectedAgent(junior) }
    const blockedTools = [...new Set([...(junior.blockedTools ?? []), "spawn", "spawn_wave", "dependency_graph"])].sort()
    return { ok: true, status: "ok", routeKind: "category", task: input.task, category, reason: resolved.modelResolution.reason, selectedAgent: selectedAgent(junior), modelProfile: resolved.modelProfile, blockedTools, verificationGate: { required: true, gate: "dependency-free-smoke", kind: "self-verify", status: "required" }, delegation: { allowed: false, reason: "Sisyphus-Junior executes bounded category tasks and cannot re-delegate uncontrolled work.", blockedTools: ["spawn", "spawn_wave", "dependency_graph"] }, modelResolution: resolved.modelResolution, categoryRouting: categoryRouteCatalog() }
  }
  const agent = byId.get(subagentType ?? "")
  if (!agent) return { ok: false, status: "blocked", error: "unknown subagent_type", subagent_type: subagentType, known: registry.map((item) => item.id).sort(), categoryRouting: categoryRouteCatalog() }
  const resolved = resolveModelProfile(agent, { provider: agent.modelProfile.provider, model: agent.modelProfile.model, reasoning: agent.modelProfile.reasoning })
  if (!resolved.ok) return { ...resolved, status: resolved.status ?? "blocked", routeKind: "subagent_type", categoryRouting: categoryRouteCatalog(), selectedAgent: selectedAgent(agent) }
  return { ok: true, status: "ok", routeKind: "subagent_type", task: input.task, selectedAgent: selectedAgent(agent), modelProfile: resolved.modelProfile, blockedTools: [...(agent.blockedTools ?? [])], verificationGate: { required: true, gate: "dependency-free-smoke", kind: "self-verify", status: "required" }, delegation: { allowed: false, reason: "Bounded routing keeps delegated tasks from becoming uncontrolled recursion." }, modelResolution: resolved.modelResolution, categoryRouting: categoryRouteCatalog() }
}

export function categoryRouteCatalog(): Record<string, unknown> {
  return { supportedCategories: [...OMO_LFG_SUPPORTED_CATEGORY_NAMES], upstreamCategories: [...OMO_UPSTREAM_CATEGORY_NAMES], categoryModelProfiles: OMO_CATEGORY_MODEL_PROFILES, migrationNotes: OMO_CATEGORY_MIGRATION_NOTES, defaultAgent: "sisyphus-junior" }
}

function selectedAgent(agent: { id: string; name: string; family: string; mode: string }): Record<string, string> {
  return { id: agent.id, name: agent.name, family: agent.family, mode: agent.mode }
}
