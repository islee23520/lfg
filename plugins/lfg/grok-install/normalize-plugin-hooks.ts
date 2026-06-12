import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { isGrokEventHooksJson, validateGrokHooksJson } from "./hook-trust"
import { resolveGrokHookBridgeAssetPath } from "./resolve-hook-bridge-asset"

const BRIDGE_RELATIVE = join("hooks", "lfg-grok-hook-bridge.mjs")
const CONFIG_LOADER_FILE = "lfg-config-loader.mjs" as const
const PROJECT_OMO_LEDGER_FILE = "lfg-project-omo-ledger.mjs" as const
const CONFIG_LOADER_RELATIVE = join("hooks", CONFIG_LOADER_FILE)

const PLUGIN_ROOT_PLACEHOLDER = /\$\{PLUGIN_ROOT\}/g

/** Grok expands GROK_PLUGIN_ROOT; lazycodex hooks still use ${PLUGIN_ROOT} in commands. */
export function normalizeHookCommandPaths(command: string): string {
  return command.replace(PLUGIN_ROOT_PLACEHOLDER, "${GROK_PLUGIN_ROOT}")
}

type JsonRecord = Record<string, unknown>

export async function syncGrokHookBridgeIntoPlugin(pluginRoot: string): Promise<string> {
  const assetPath = await resolveGrokHookBridgeAssetPath()
  const destPath = join(pluginRoot, BRIDGE_RELATIVE)
  await mkdir(dirname(destPath), { recursive: true })
  await copyFile(assetPath, destPath)
  await copyFile(join(dirname(assetPath), CONFIG_LOADER_FILE), join(pluginRoot, CONFIG_LOADER_RELATIVE))
  await copyFile(join(dirname(assetPath), PROJECT_OMO_LEDGER_FILE), join(pluginRoot, "hooks", PROJECT_OMO_LEDGER_FILE))

  // Copy .mcp.json so that Grok MCP servers (ast_grep, lsp, etc.) are wired with correct paths
  const mcpAsset = join(dirname(assetPath), ".mcp.json")
  if (await exists(mcpAsset)) {
    await copyFile(mcpAsset, join(pluginRoot, ".mcp.json"))
  } else {
    // Fallback: copy from fixture if asset missing
    const fixtureMcp = join(dirname(assetPath), "..", "fixture-minimal", ".mcp.json")
    if (await exists(fixtureMcp)) {
      await copyFile(fixtureMcp, join(pluginRoot, ".mcp.json"))
    }
  }
  return destPath
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function normalizePluginHooksJson(pluginRoot: string): Promise<{
  readonly path: string
  readonly changed: boolean
  readonly hookNames: readonly string[]
}> {
  await syncGrokHookBridgeIntoPlugin(pluginRoot)
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  const raw = await readFile(hooksPath, "utf8")
  const parsed: unknown = JSON.parse(raw)
  if (!isGrokEventHooksJson(parsed)) {
    const trust = validateGrokHooksJson(parsed)
    throw new Error(trust.error ?? "hooks.json is not Grok event format")
  }
  const record = parsed as JsonRecord
  const hooksBlock = record.hooks as JsonRecord
  let changed = false
  const nextBlock: JsonRecord = {}
  for (const [eventName, groups] of Object.entries(hooksBlock)) {
    if (!Array.isArray(groups)) {
      nextBlock[eventName] = groups
      continue
    }
    nextBlock[eventName] = groups.map((group) =>
      normalizeHookGroup(group, () => {
        changed = true
      }),
    )
  }
  const nextPayload = { hooks: addLfgConfigLoaderHooks(nextBlock) }
  const trust = validateGrokHooksJson(nextPayload)
  if (!trust.ok) {
    throw new Error(trust.error ?? "invalid hooks after normalize")
  }
  const nextText = `${JSON.stringify(nextPayload, null, 2)}\n`
  if (changed || nextText !== raw) {
    await writeFile(hooksPath, nextText, "utf8")
    return { path: hooksPath, changed: true, hookNames: trust.hookNames }
  }
  return { path: hooksPath, changed: false, hookNames: trust.hookNames }
}

function addLfgConfigLoaderHooks(hooksBlock: JsonRecord): JsonRecord {
  return {
    ...hooksBlock,
    SessionStart: appendConfigLoader(hooksBlock.SessionStart, "SessionStart"),
    UserPromptSubmit: appendConfigLoader(hooksBlock.UserPromptSubmit, "UserPromptSubmit"),
  }
}

function appendConfigLoader(groups: unknown, eventName: string): readonly unknown[] {
  const current = Array.isArray(groups) ? groups : []
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${CONFIG_LOADER_FILE}"`
  if (current.some((group) => groupHasCommand(group, command))) {
    return current
  }
  return [
    ...current,
    {
      hooks: [{ type: "command", command, timeout: 5, description: `lfg global config loader (${eventName})` }],
    },
  ]
}

function groupHasCommand(group: unknown, command: string): boolean {
  if (typeof group !== "object" || group === null) return false
  const hooks = (group as JsonRecord).hooks
  if (!Array.isArray(hooks)) return false
  return hooks.some((handler) => {
    if (typeof handler !== "object" || handler === null) return false
    return (handler as JsonRecord).command === command
  })
}

function normalizeHookGroup(group: unknown, onChange: () => void): unknown {
  if (typeof group !== "object" || group === null) {
    return group
  }
  const g = group as JsonRecord
  if (!Array.isArray(g.hooks)) {
    return group
  }
  const hooks = g.hooks.map((handler) => normalizeHandler(handler, onChange))
  return { ...g, hooks }
}

function normalizeHandler(handler: unknown, onChange: () => void): unknown {
  if (typeof handler !== "object" || handler === null) {
    return handler
  }
  const h = handler as JsonRecord
  if (h.type !== "command" || typeof h.command !== "string") {
    return handler
  }
  const next = wrapLazyCodexHookCommand(normalizeHookCommandPaths(h.command))
  if (next === h.command) {
    return handler
  }
  onChange()
  return { ...h, command: next }
}

/** Route component CLIs through Codex↔Grok stdin/env bridge.
 * Idempotent: repeatedly peel any existing outer bridge wrappers, then apply exactly one clean layer.
 */
export function wrapLazyCodexHookCommand(command: string): string {
  let trimmed = command.trim()
  if (!/^node\s+/i.test(trimmed)) {
    return command
  }

  const BRIDGE_MARKER = "lfg-grok-hook-bridge.mjs"

  // Peel outer bridge wrappers until we reach a non-bridge target.
  // A wrapped form is: node "<bridge>" node "<real>" [args...]
  // or without quotes.
  while (true) {
    const m = trimmed.match(/^node\s+("(?:[^"\\]|\\.)*"|[^\s]+)\s*(.*)$/i)
    if (!m) break
    const first = m[1]!
    const rest = (m[2] ?? "").trim()
    if (first.toLowerCase().includes(BRIDGE_MARKER)) {
      // strip this bridge layer; the real command starts after it
      if (rest.length === 0) {
        // nothing left; bail to avoid infinite
        break
      }
      trimmed = rest.startsWith("node ") ? rest : `node ${rest}`
      continue
    }
    // first target is not the bridge
    break
  }

  // If after peeling there is still no component/script, leave original untouched.
  if (!trimmed.includes("/components/") && !trimmed.includes("/scripts/")) {
    return command
  }

  const m2 = trimmed.match(/^node\s+("(?:[^"\\]|\\.)*"|[^\s]+)\s*(.*)$/i)
  if (!m2) {
    return command
  }
  const nodeTarget = m2[1]!
  const rest = m2[2] ?? ""
  const bridge = '"${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs"'
  const rebuilt = `node ${bridge} node ${nodeTarget}${rest.length > 0 ? ` ${rest}` : ""}`
  return rebuilt
}