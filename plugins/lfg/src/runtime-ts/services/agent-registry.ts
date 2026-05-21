import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveLfgEnv } from "../foundation/env"
import type { ModelProfile } from "./model-resolution"

export const CANONICAL_OMO_AGENT_IDS = ["sisyphus", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "explore", "multimodal-looker", "metis", "momus", "sisyphus-junior", "builtin-agents"] as const
export const OMO_PRIMARY_AGENT_IDS = ["sisyphus", "hephaestus", "prometheus", "atlas"] as const
export type PrimaryOmoAgentId = typeof OMO_PRIMARY_AGENT_IDS[number]
export const OMO_ELIGIBLE_TEAM_MEMBER_IDS = ["sisyphus", "atlas", "sisyphus-junior"] as const
export const OMO_CONDITIONAL_TEAM_MEMBER_IDS = ["hephaestus"] as const
export const OMO_HARD_REJECT_TEAM_MEMBER_IDS = ["prometheus", "oracle", "librarian", "explore", "multimodal-looker", "metis", "momus"] as const
export const OMO_TEAM_ELIGIBILITY_REGISTRY: Record<string, TeamEligibility> = { sisyphus: "eligible", hephaestus: "conditional", prometheus: "hard-reject", atlas: "eligible", oracle: "hard-reject", librarian: "hard-reject", explore: "hard-reject", "multimodal-looker": "hard-reject", metis: "hard-reject", momus: "hard-reject", "sisyphus-junior": "eligible", "builtin-agents": "policy-layer" }

export type CanonicalOmoAgentId = typeof CANONICAL_OMO_AGENT_IDS[number]
export type TeamEligibility = "eligible" | "conditional" | "hard-reject" | "policy-layer" | "unknown"
export type OmoAgent = {
  id: string
  name: string
  family: string
  role: string
  mode: string
  modelProfile: ModelProfile
  categories: string[]
  blockedTools?: string[]
  teamEligibility: TeamEligibility
  teamMemberEligible: boolean
  teamMemberConditional: boolean
  primaryOrder: boolean
  [key: string]: unknown
}

export async function loadOmoAgentRegistry(agentsDir = join(resolveLfgEnv().root, "src", "agents")): Promise<OmoAgent[]> {
  const files = (await readdir(agentsDir)).filter((file) => file.endsWith(".json")).sort()
  const agents: OmoAgent[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(join(agentsDir, file), "utf8"))
    if (!isAgentBase(parsed)) continue
    if (seen.has(parsed.id) || file !== `${parsed.id}.json`) continue
    agents.push(normalizeOmoAgentRecord(parsed))
    seen.add(parsed.id)
  }
  const missing = CANONICAL_OMO_AGENT_IDS.filter((id) => !seen.has(id))
  if (missing.length > 0) throw new Error(`missing required OMO agent definition(s) in ${agentsDir}: ${missing.join(", ")}`)
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  return [...CANONICAL_OMO_AGENT_IDS.map((id) => byId.get(id)).filter((agent): agent is OmoAgent => agent !== undefined), ...agents.filter((agent) => !CANONICAL_OMO_AGENT_IDS.includes(agent.id as CanonicalOmoAgentId))]
}

export function normalizeOmoAgentRecord(agent: OmoAgent): OmoAgent {
  const eligibility = OMO_TEAM_ELIGIBILITY_REGISTRY[agent.id] ?? agent.teamEligibility ?? "unknown"
  return { ...agent, teamEligibility: eligibility, teamMemberEligible: eligibility === "eligible", teamMemberConditional: eligibility === "conditional", primaryOrder: OMO_PRIMARY_AGENT_IDS.includes(agent.id as PrimaryOmoAgentId) }
}

export async function agentsList(options: { ids?: boolean; json?: boolean } = {}, agentsDir?: string): Promise<Record<string, unknown>> {
  const agents = await loadOmoAgentRegistry(agentsDir)
  if (options.ids) return { ok: true, ids: agents.map((agent) => agent.id), count: agents.length, ...(options.json ? {} : { _raw_text: agents.map((agent) => agent.id).join("\n") }) }
  return { ok: true, status: "ok", agents, count: agents.length }
}

export async function agentsInspect(agentId: string, agentsDir?: string): Promise<Record<string, unknown>> {
  const agents = await loadOmoAgentRegistry(agentsDir)
  const agent = agents.find((candidate) => candidate.id === agentId)
  if (!agent) return { ok: false, error: `unknown agent: '${agentId}'`, known: agents.map((candidate) => candidate.id).sort() }
  return { ok: true, agent, resolvedModelProfile: agent.modelProfile }
}

export function teamMemberEligibility(agentId: string): TeamEligibility {
  return OMO_TEAM_ELIGIBILITY_REGISTRY[agentId] ?? "unknown"
}

export function validateTeamMemberEligibility(agentId: string): Record<string, unknown> {
  const eligibility = teamMemberEligibility(agentId)
  if (eligibility === "hard-reject" || eligibility === "policy-layer") return { ok: false, error: "team member eligibility rejected", agent: agentId, teamEligibility: eligibility, eligibleTeamMembers: [...OMO_ELIGIBLE_TEAM_MEMBER_IDS], conditionalTeamMembers: [...OMO_CONDITIONAL_TEAM_MEMBER_IDS], hardRejectedTeamMembers: [...OMO_HARD_REJECT_TEAM_MEMBER_IDS], policyLayerTeamMembers: ["builtin-agents"] }
  return { ok: true, agent: agentId, teamEligibility: eligibility }
}

function isAgentBase(value: unknown): value is OmoAgent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === "string" && typeof record.name === "string" && typeof record.family === "string" && typeof record.role === "string" && typeof record.mode === "string" && Array.isArray(record.categories) && isModelProfile(record.modelProfile)
}

function isModelProfile(value: unknown): value is ModelProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.provider === "string" && typeof record.model === "string" && typeof record.reasoning === "string"
}
