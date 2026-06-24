import { ensureCuaDriverSkill, ensureUlwWorkflowSkills } from "../doctor/ensure-cua-driver-skill"
import { ensureHephaestusModelGate } from "../agents/ensure-hephaestus-model-gate"
import { normalizePluginHooksJson } from "../hooks/normalize-plugin-hooks"

export type PostInstallPluginSyncResult = {
  readonly path: string
  readonly hookNames: readonly string[]
  readonly changed: boolean
}

export async function syncPostInstallPluginPayload(pluginRoot: string): Promise<PostInstallPluginSyncResult> {
  const hooks = await normalizePluginHooksJson(pluginRoot)
  await ensureCuaDriverSkill(pluginRoot)
  await ensureUlwWorkflowSkills(pluginRoot)
  await ensureHephaestusModelGate(pluginRoot)
  return { path: hooks.path, hookNames: hooks.hookNames, changed: hooks.changed }
}
