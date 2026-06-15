import { normalizePluginHooksJson } from "./normalize-plugin-hooks"

/** T6: native first-party lfg hook install as Grok event-map (using validateGrokHooksJson + allowlist); bridge fallback for legacy/imported only. Idempotent. */
export async function mergePortedHooksIntoPlugin(pluginRoot: string): Promise<{
  readonly path: string
  readonly hookNames: readonly string[]
}> {
  const result = await normalizePluginHooksJson(pluginRoot)
  return { path: result.path, hookNames: result.hookNames }
}