import { writeFile } from "node:fs/promises"
import { join } from "node:path"

export const COMPONENT_INVENTORY_FILE = "lfg-component-inventory.json" as const

const COMPONENTS = [
  { id: "comment-checker", status: "Deferred", evidence: "Codex PostToolUse hook behavior has no Grok-native equivalent wired by lfg yet." },
  { id: "git-bash", status: "Unsupported", evidence: "Windows Git Bash MCP is Codex-host specific and outside Grok setup scope." },
  { id: "rules", status: "Grok-adapted", evidence: "Component hooks are bridged through lfg-grok-hook-bridge.mjs when present in the installed payload." },
  { id: "lsp", status: "Deferred", evidence: "LSP MCP tools are not exposed by the setup-only Grok adapter package yet." },
  { id: "ultrawork", status: "Grok-adapted", evidence: "Ultrawork hook commands are bridged when present; role prompts are synced from component agents." },
  { id: "ulw-loop", status: "Grok-adapted", evidence: "Project .omo awareness is installed fail-closed through lfg-config-loader.mjs." },
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
    components: COMPONENTS,
  }
  await writeFile(path, `${JSON.stringify(inventory, null, 2)}\n`, "utf8")
  return path
}
