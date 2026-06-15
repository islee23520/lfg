/** Legacy Codex/LFP fields that must not appear on Grok setup JSON (#21). */
export const DEPRECATED_SETUP_JSON_KEYS = [
  "stablePluginLink",
  "stablePluginLinks",
  "mcpConfigRepair",
  "adapter",
] as const

export function findDeprecatedSetupJsonKeys(json: Record<string, unknown>): readonly string[] {
  return DEPRECATED_SETUP_JSON_KEYS.filter((key) => key in json)
}

export function setupPostInstallConsistent(ok: boolean, postInstallVerify: { readonly ok?: boolean }): boolean {
  if (!ok) {
    return true
  }
  return postInstallVerify.ok === true
}