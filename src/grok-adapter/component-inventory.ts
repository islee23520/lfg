import { writeFile } from "node:fs/promises"
import { join } from "node:path"

export const COMPONENT_INVENTORY_FILE = "lfg-component-inventory.json" as const
export const UPSTREAM_OMO_NAME = "oh-my-openagent" as const
export const UPSTREAM_OMO_VERSION = "4.12.1" as const
export const UPSTREAM_OMO_TAG = "v4.12.1" as const
export const UPSTREAM_OMO_RELEASE_URL = "https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.12.1" as const

const COMPONENTS = [
  { id: "comment-checker", status: "Deferred", evidence: "Codex PostToolUse hook behavior has no Grok-native equivalent wired by lfg yet." },
  { id: "git-bash", status: "Manifest-only", evidence: "git_bash MCP is disabled on macOS/Linux and Windows-unverified. lfg can copy the upstream 4.12.1 git-bash-mcp runtime from a package-shaped source, but behavior-level Windows support remains unverified." },
  { id: "rules", status: "Grok-adapted", evidence: "Component hooks are bridged through lfg-grok-hook-bridge.mjs when present in the installed payload." },
  { id: "lsp", status: "Manifest-only", evidence: "lsp MCP is present in plugin .mcp.json. lfg can copy the upstream 4.12.1 lsp-daemon runtime from a package-shaped source, but Grok-adapted LSP hook/tool behavior is still deferred." },
  { id: "ast_grep", status: "Manifest-only", evidence: "ast_grep MCP is present in plugin .mcp.json with an lfg-owned local runtime stub; tools/list intentionally remains empty until a real Grok-adapted runtime is packaged." },
  { id: "codegraph", status: "Grok-adapted", evidence: "External @colbymchenry/codegraph semantic-code-graph MCP binary wrapped via utils/codegraph provisioning + Grok-native .mcp.json command server; Phase 0 of the core/adapter port strategy (docs/grok-adapter-core-port-strategy.md)." },
  { id: "grep_app", status: "Remote URL manifest-only", evidence: "grep_app MCP is represented as the upstream remote URL server https://mcp.grep.app; lfg validates manifest shape and does not live-call it by default." },
  { id: "context7", status: "Remote URL manifest-only", evidence: "context7 MCP is represented as the upstream remote URL server https://mcp.context7.com/mcp; lfg validates manifest shape and does not live-call it by default." },
  { id: "ultrawork", status: "Grok-adapted", evidence: "Ultrawork OMO hook parity routed natively via component/runtime and Grok-native OMO agent surfaces (default/sisyphus/role agents); implements `omo hook <event>` shape for Grok without new top-level commands." },
  { id: "ulw-loop", status: "Grok-adapted", evidence: "Project .omo awareness plus upstream OMO ulw-loop skill directory installed via skills/ copy, including references/full-workflow.md for Bootstrap/Execution Loop/Manual-QA channels." },
  { id: "ulw-plan", status: "Grok-adapted", evidence: "Upstream OMO ulw-plan skill directory installed via skills/ copy, including references/full-workflow.md, intent references, and scripts/scaffold-plan.mjs." },
  { id: "bootstrap", status: "Deferred", evidence: "Upstream bootstrap provisioning is a SessionStart component for Codex runtime dependencies; lfg does not run provisioning hooks during Grok setup." },
  { id: "auto-update", status: "Unsupported", evidence: "Upstream auto-update is a SessionStart script that can run `npx lazycodex-ai@latest install`; lfg keeps updates user-controlled and does not enable this hook." },
  { id: "start-work-continuation", status: "Deferred", evidence: "Boulder/start-work continuation is not yet driven as a Grok-native lifecycle workflow." },
  { id: "prompts-core", status: "Grok-adapted", evidence: "Phase 3 of the core/adapter port strategy: prompts-core source (types, loader, variant-resolver, prompt tables for atlas/prometheus/ultrawork/mode) vendored under src/grok-adapter/prompts-core-vendored/; Grok glue in grok-prompt-adapter.ts resolves the default variant for Grok models via the fallback chain (docs/grok-adapter-core-port-strategy.md)." },
  { id: "agent-builder", status: "Grok-adapted", evidence: "Phase 4 of the core/adapter port strategy: agent-builder foundation + dynamic-agent prompt builders + curated builtin agent registry vendored under src/grok-adapter/agent-builder-vendored/; Grok glue in grok-agent-builder-adapter.ts assembles Grok agent roles (5/9 agents fully ported; oracle/metis/sisyphus/hephaestus deferred as host-bound). See docs/grok-adapter-core-port-strategy.md." },
  { id: "delegate-core", status: "Grok-adapted", evidence: "Phase 5 of the core/adapter port strategy: delegate-core source (model-selection, retry-patterns, retry-guidance) vendored under src/grok-adapter/delegate-core-vendored/; Grok glue in grok-delegate-adapter.ts maps delegate-task model selection to Grok subagent routing (docs/grok-adapter-core-port-strategy.md)." },
  { id: "boulder-state", status: "Grok-adapted", evidence: "Phase 5 of the core/adapter port strategy: boulder-state source (plan-checklist, types, storage) vendored under src/grok-adapter/boulder-state-vendored/; Grok glue in grok-delegate-adapter.ts bridges plan-checklist to the .omo/plans convention (docs/grok-adapter-core-port-strategy.md)." },
  { id: "skills-loader-core", status: "Grok-adapted", evidence: "Phase 6 of the core/adapter port strategy: skills-loader-core host-neutral primitives (config, shared, builtin-skills loader) vendored under src/grok-adapter/skills-loader-core-vendored/; Grok glue in grok-skills-loader-adapter.ts discovers skills from Grok skill roots (OpenCode-bound discovery layers deferred). See docs/grok-adapter-core-port-strategy.md." },
  { id: "teammode", status: "Deferred", evidence: "Upstream 4.12.1 teammode skill payload is installed as an upstream-derived skill, but the Codex codex_app thread orchestration hook is not Grok-adapted yet." },
  { id: "lazycodex-executor-verify", status: "Deferred", evidence: "Upstream 4.12.1 SubagentStop evidence verifier targets the Codex lazycodex-executor agent and requires Grok-specific agent naming/event adaptation before it can be enabled." },
  { id: "telemetry", status: "Unsupported", evidence: "lfg does not emit upstream anonymous telemetry." },
] as const

export type ComponentInventorySource =
  | "source_tree"
  | "source_override"
  | "omo_native_bundle"
  | "lazycodex_bundle"
  | "fixture_fallback"
  | "repair_adapter"

export type ComponentInventoryOptions = {
  readonly pluginRoot: string
  readonly packageVersion: string
  readonly source: ComponentInventorySource
}

export function componentInventoryPath(pluginRoot: string): string {
  return join(pluginRoot, COMPONENT_INVENTORY_FILE)
}

export async function writeComponentInventory(options: ComponentInventoryOptions): Promise<string> {
  const path = componentInventoryPath(options.pluginRoot)
  const inventory = {
    inventoryVersion: 1,
    packageName: "@islee23520/lfg",
    packageVersion: options.packageVersion,
    platform: "grok",
    source: options.source,
    upstreamName: UPSTREAM_OMO_NAME,
    upstreamVersion: UPSTREAM_OMO_VERSION,
    upstreamTag: UPSTREAM_OMO_TAG,
    upstreamReleaseUrl: UPSTREAM_OMO_RELEASE_URL,
    components: COMPONENTS,
  }
  await writeFile(path, `${JSON.stringify(inventory, null, 2)}\n`, "utf8")
  return path
}
