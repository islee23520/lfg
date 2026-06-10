import { normalizePluginHooksJson } from "./normalize-plugin-hooks"

/** Post-install: normalize lazycodex hooks for Grok (paths + trust); no metadata catalog merge. */
export async function mergePortedHooksIntoPlugin(pluginRoot: string): Promise<{
  readonly path: string
  readonly hookNames: readonly string[]
}> {
  const result = await normalizePluginHooksJson(pluginRoot)
  return { path: result.path, hookNames: result.hookNames }
}