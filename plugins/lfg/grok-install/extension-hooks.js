import { normalizePluginHooksJson } from "./normalize-plugin-hooks";
/** T6: native first-party lfg hook install (no bridge for fixture defs; legacy converts to event-map w/ bridge fallback via normalize). */
export async function mergePortedHooksIntoPlugin(pluginRoot) {
    const result = await normalizePluginHooksJson(pluginRoot);
    return { path: result.path, hookNames: result.hookNames };
}
