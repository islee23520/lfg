import { resolveLfgEnv, type LfgEnv } from "../foundation/env"
import { spawnFallbackAgent, type SpawnAgentOptions, type FallbackSpawnEnvelope } from "../services/spawn-adapter"

export type SpawnCommandInput = SpawnAgentOptions & { agentId?: string; agent_id?: string }

export async function spawnCommand(input: SpawnCommandInput, env: LfgEnv = resolveLfgEnv()): Promise<FallbackSpawnEnvelope> {
  const agentId = input.agentId ?? input.agent_id
  if (!agentId) throw new Error("spawn requires agentId")
  return spawnFallbackAgent(agentId, input, env)
}
