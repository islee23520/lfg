import { homedir } from "node:os"
import type { JsonObject } from "../bin/lfg-json"
import { grokConfigJson, writeGrokModelConfig } from "../bin/lfg-grok-config"
import type { ModelDiscovery } from "../bin/lfg-models"
import { modelDiscoveryEnv } from "../bin/lfg-models"
import { ensureLfgPluginsEnabled } from "./grok-plugins-enable"
import {
  resolveLazycodexAgentOverrides,
  writeLazycodexAgentOverridesFile,
} from "./lazycodex-agent-overrides"
import { resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config"
import { runInternalGrokInstall } from "./run-internal"
import { syncLazycodexAgentsToGrokLedger, type SyncLazycodexAgentsResult } from "./sync-lazycodex-agents-to-grok"

export const INTERNAL_GROK_INSTALL_PACKAGE = "lfg-grok-install" as const
export const INTERNAL_GROK_INSTALL_COMMAND = "@islee23520/lfg internal grok-install" as const

export type GrokInstallRunResult = {
  readonly ok: boolean
  readonly configUpdate: Awaited<ReturnType<typeof writeGrokModelConfig>> | null
  readonly internalStep: JsonObject
  readonly lazycodexAgents: SyncLazycodexAgentsResult | null
  readonly agentOverridesPath: string | null
  readonly pluginsEnabled: Awaited<ReturnType<typeof ensureLfgPluginsEnabled>> | null
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
  const resolvedAgents = await resolveGlobalLazycodexAgentConfig(home, discovery)
  const configUpdate =
    discovery !== null
      ? await writeGrokModelConfig(discovery, {
          apiKey: env.OPENAI_API_KEY,
          home,
          agentConfig: resolvedAgents,
        })
      : null
  const overrideMap =
    discovery?.agentOverrideMap !== undefined
      ? discovery.agentOverrideMap
      : await resolveLazycodexAgentOverrides(home, resolvedAgents)
  const overridesPath = await writeLazycodexAgentOverridesFile(home, overrideMap)
  const lazycodexAgents = await syncLazycodexAgentsToGrokLedger(home, overrideMap)
  const pluginsEnabled = await ensureLfgPluginsEnabled(home)
  return {
    ok: internalStep.ok === true,
    configUpdate,
    internalStep,
    lazycodexAgents,
    agentOverridesPath: overridesPath,
    pluginsEnabled,
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