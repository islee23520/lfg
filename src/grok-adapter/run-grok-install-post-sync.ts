import { ensureCuaDriverSkill, ensureUlwWorkflowSkills } from "./ensure-cua-driver-skill"
import { ensureHephaestusModelGate } from "./ensure-hephaestus-model-gate"
import { normalizePluginHooksJson } from "./normalize-plugin-hooks"

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
