import { homedir } from "node:os"
import type { JsonObject } from "../bin/lfg-json"
import { grokConfigJson, writeGrokModelConfig } from "../bin/lfg-grok-config"
import type { ModelDiscovery } from "../bin/lfg-models"
import { defaultLazycodexAgentConfig, modelDiscoveryEnv } from "../bin/lfg-models"
import { applyLazycodexAgentTomls } from "./apply-agent-tomls"
import { runInternalGrokInstall } from "./run-internal"

export const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install" as const
export const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install" as const

export type GrokInstallRunResult = {
  readonly ok: boolean
  readonly configUpdate: Awaited<ReturnType<typeof writeGrokModelConfig>> | null
  readonly internalStep: JsonObject
  readonly agentTomls: Awaited<ReturnType<typeof applyLazycodexAgentTomls>> | null
}

/** Single transaction: internal plugin sync then optional config.toml merge (lfg-owned sections). */
export async function runGrokInstall(
  discovery: ModelDiscovery | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GrokInstallRunResult> {
  const home = env.HOME ?? homedir()
  const agentConfig = discovery?.agentConfig ?? null
  const internalEnv = { ...env, ...modelDiscoveryEnv(discovery, agentConfig) }
  const internalStep = await runInternalGrokInstall(internalEnv)
  const resolvedAgents = discovery === null ? null : agentConfig ?? defaultLazycodexAgentConfig(discovery)
  const configUpdate =
    discovery !== null
      ? await writeGrokModelConfig(discovery, {
          apiKey: env.OPENAI_API_KEY,
          home,
          agentConfig: resolvedAgents ?? undefined,
        })
      : null
  const agentTomls = resolvedAgents === null ? null : await applyLazycodexAgentTomls(home, resolvedAgents)
  return {
    ok: internalStep.ok === true,
    configUpdate,
    internalStep,
    agentTomls,
  }
}

export function grokInstallStepJson(internalStep: JsonObject): JsonObject {
  return {
    packageName: INTERNAL_GROK_INSTALL_PACKAGE,
    command: INTERNAL_GROK_INSTALL_COMMAND,
    args: [] as const,
    exitCode: typeof internalStep.exitCode === "number" ? internalStep.exitCode : 1,
    stdout: typeof internalStep.stdout === "string" ? internalStep.stdout : "",
    stderr: typeof internalStep.stderr === "string" ? internalStep.stderr : "",
  }
}

export function configFieldsFromRun(configUpdate: GrokInstallRunResult["configUpdate"]): JsonObject {
  if (configUpdate === null) {
    return {}
  }
  return {
    configUpdated: true,
    configPath: configUpdate.path,
    modelsBaseUrl: configUpdate.modelsBaseUrl,
    grokConfig: grokConfigJson(configUpdate),
  }
}