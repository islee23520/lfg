import { ensureCuaDriverSkill, ensureUlwWorkflowSkills } from "../doctor/ensure-cua-driver-skill"
import { ensureHephaestusModelGate } from "../agents/ensure-hephaestus-model-gate"
import { normalizePluginHooksJson } from "../hooks/normalize-plugin-hooks"
import { repairLspMcpRuntime } from "../mcp/materialize-grok-mcp"
import { ensureLfgPluginPackageManifest } from "../payload/install"

export type PostInstallPluginSyncResult = {
  readonly path: string
  readonly hookNames: readonly string[]
  readonly changed: boolean
}

export async function syncPostInstallPluginPayload(pluginRoot: string): Promise<PostInstallPluginSyncResult> {
  // Always repair package.json "type":"module" so .mjs native hooks (rules, ultrawork, sisyphus, comment-checker, bridge) load as ESM.
  await ensureLfgPluginPackageManifest(pluginRoot)
  const hooks = await normalizePluginHooksJson(pluginRoot)
  await repairLspMcpRuntime(pluginRoot)
  await ensureCuaDriverSkill(pluginRoot)
  await ensureUlwWorkflowSkills(pluginRoot)
  await ensureHephaestusModelGate(pluginRoot)
  return { path: hooks.path, hookNames: hooks.hookNames, changed: hooks.changed }
}
