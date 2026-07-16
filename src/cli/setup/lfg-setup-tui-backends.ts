import type { BackendRoutingConfig, CliBackend } from "../../core/lfg/backend-routing"

/** Fixed product routing: CEO on Grok, implementer on Codex App. No setup quiz. */
export function fixedBackendRouting(overrideGlobal?: CliBackend): BackendRoutingConfig {
  return {
    version: 1,
    global: overrideGlobal ?? "codex",
    categories: {},
    agents: { sisyphus: "grok" },
  }
}

/** Kept for call-site compatibility; never prompts. */
export async function configureBackendRouting(
  _prompts: unknown,
  _initial?: BackendRoutingConfig,
): Promise<BackendRoutingConfig> {
  return fixedBackendRouting()
}
