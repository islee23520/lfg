import { writeFile } from "node:fs/promises"
import { join } from "node:path"

export const COMPONENT_INVENTORY_FILE = "lfg-component-inventory.json" as const
export const UPSTREAM_OMO_NAME = "lazycodex-ai" as const
export const UPSTREAM_OMO_VERSION = "4.10.0" as const
export const UPSTREAM_OMO_TAG = "v4.10.0" as const
export const UPSTREAM_OMO_RELEASE_URL = "https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.10.0" as const

const COMPONENTS = [
  { id: "comment-checker", status: "Deferred", evidence: "Codex PostToolUse hook behavior has no Grok-native equivalent wired by lfg yet." },
  { id: "git-bash", status: "Windows-only", evidence: "git_bash MCP emitted only on Windows per plan; disabled_mcp_servers on macOS/Linux." },
  { id: "rules", status: "Grok-adapted", evidence: "Component hooks are bridged through lfg-grok-hook-bridge.mjs when present in the installed payload." },
  { id: "lsp", status: "Grok-adapted", evidence: "lsp MCP wired via plugin .mcp.json pointing to ./components/lsp/dist/cli.js mcp (uses omo-lsp CLI that resolves to lsp-daemon)." },
  { id: "ast_grep", status: "Grok-adapted", evidence: "ast_grep MCP wired via plugin .mcp.json pointing to node_modules/@code-yeongyu/ast-grep-mcp/dist/cli.js mcp (verified post-install)." },
  { id: "ultrawork", status: "Grok-adapted", evidence: "Ultrawork OMO hook parity routed natively via component/runtime and Grok-native OMO agent surfaces (default/ulw/role agents); implements `omo hook <event>` shape for Grok without new top-level commands." },
  { id: "ulw-loop", status: "Grok-adapted", evidence: "Project .omo awareness + self-contained SKILL.md workflow payloads (Bootstrap/Execution Loop/Manual-QA channels) installed via skills/ copy. No sibling guessing." },
  { id: "ulw-plan", status: "Grok-adapted", evidence: "Self-contained ulw-plan SKILL.md with Phase 0/Approval gate/Phase 3 (source-of-truth generation avoids full-workflow.md drift)." },
  { id: "start-work-continuation", status: "Deferred", evidence: "Boulder/start-work continuation is not yet driven as a Grok-native lifecycle workflow." },
  { id: "telemetry", status: "Unsupported", evidence: "lfg does not emit upstream anonymous telemetry." },
] as const

export type ComponentInventorySource =
  | "source_tree"
  | "source_override"
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
