import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createFirstPartyNativeGrokHooks, createNativeGrokHooksForLegacyFallback, isGrokEventHooksJson, isLegacyMetadataHooksJson, validateGrokHooksJson } from "./hook-trust"
import { resolveGrokHookBridgeAssetPath } from "./resolve-hook-bridge-asset"

const BRIDGE_RELATIVE = join("hooks", "lfg-grok-hook-bridge.mjs")
const CONFIG_LOADER_FILE = "lfg-config-loader.mjs" as const
const PROJECT_OMO_LEDGER_FILE = "lfg-project-omo-ledger.mjs" as const
const SISYPHUS_HOOKS_FILE = "lfg-sisyphus-hooks.mjs" as const
const CONFIG_LOADER_RELATIVE = join("hooks", CONFIG_LOADER_FILE)
const ACTIVE_GROK_HOOKS_FILE = "lfg-hooks.json" as const

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
  await copyFile(join(dirname(assetPath), SISYPHUS_HOOKS_FILE), join(pluginRoot, "hooks", SISYPHUS_HOOKS_FILE))
  // .mcp.json is written by materializeGrokMcpRuntimes() during installGrokPluginFromSource — do not overwrite here with dev-only absolute paths.
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
  /** T6 native first-party: uses validateGrokHooksJson + GROK_HOOK_EVENTS allowlist from hook-trust.
   * Bridge wrapping retained only for legacy/imported hook JSON (idempotent peel+wrap). Fixture provides first-party event-map. */
  await syncGrokHookBridgeIntoPlugin(pluginRoot)
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  const raw = await readFile(hooksPath, "utf8")
  let parsed: unknown = JSON.parse(raw)
  if (isLegacyMetadataHooksJson(parsed)) {
    // T6: legacy/imported Codex-style hook JSON -> native Grok event-map *with* bridge fallback
    parsed = createNativeGrokHooksForLegacyFallback()
  } else if (!isGrokEventHooksJson(parsed)) {
    // T6: non-legacy defaults to first-party native (no bridge wrapper)
    parsed = createFirstPartyNativeGrokHooks()
  }
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
  const nextPayload = { hooks: addSisyphusHooks(addLfgConfigLoaderHooks(nextBlock)) }
  const trust = validateGrokHooksJson(nextPayload)
  if (!trust.ok) {
    throw new Error(trust.error ?? "invalid hooks after normalize")
  }
  const nextText = `${JSON.stringify(nextPayload, null, 2)}\n`
  if (changed || nextText !== raw) {
    await writeFile(hooksPath, nextText, "utf8")
  }
  const active = await materializeActiveGrokHooksJson(pluginRoot, nextPayload)
  return { path: hooksPath, changed: changed || nextText !== raw || active.changed, hookNames: trust.hookNames }
}

async function materializeActiveGrokHooksJson(pluginRoot: string, payload: unknown): Promise<{ readonly path: string; readonly changed: boolean }> {
  const activePath = join(dirname(dirname(pluginRoot)), "hooks", ACTIVE_GROK_HOOKS_FILE)
  const activePayload = toActiveGrokHooksPayload(payload, pluginRoot)
  const nextText = `${JSON.stringify(activePayload, null, 2)}\n`
  const current = await readTextIfExists(activePath)
  if (current !== nextText) {
    await mkdir(dirname(activePath), { recursive: true })
    await writeFile(activePath, nextText, "utf8")
    return { path: activePath, changed: true }
  }
  return { path: activePath, changed: false }
}

function toActiveGrokHooksPayload(payload: unknown, pluginRoot: string): unknown {
  const replaced = replacePluginRootPlaceholders(payload, pluginRoot)
  if (typeof replaced !== "object" || replaced === null) {
    return replaced
  }
  const hooks = (replaced as JsonRecord).hooks
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    return replaced
  }
  return {
    ...(replaced as JsonRecord),
    hooks: Object.fromEntries(
      Object.entries(hooks as JsonRecord).map(([eventName, groups]) => [eventName, stripLifecycleMatchers(eventName, groups)]),
    ),
  }
}

function stripLifecycleMatchers(eventName: string, groups: unknown): unknown {
  if (!LIFECYCLE_EVENTS_WITHOUT_MATCHERS.has(eventName) || !Array.isArray(groups)) {
    return groups
  }
  return groups.map((group) => {
    if (typeof group !== "object" || group === null || !("matcher" in group)) {
      return group
    }
    const { matcher: _matcher, ...rest } = group as JsonRecord
    return rest
  })
}

const LIFECYCLE_EVENTS_WITHOUT_MATCHERS = new Set(["SessionStart", "Stop", "Notification", "SubagentStart", "SubagentStop"])

function replacePluginRootPlaceholders(value: unknown, pluginRoot: string): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{GROK_PLUGIN_ROOT\}|\$\{PLUGIN_ROOT\}/g, pluginRoot)
  }
  if (Array.isArray(value)) {
    return value.map((item) => replacePluginRootPlaceholders(item, pluginRoot))
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, entry]) => [key, replacePluginRootPlaceholders(entry, pluginRoot)]),
    )
  }
  return value
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return ""
    }
    throw error
  }
}

function addLfgConfigLoaderHooks(hooksBlock: JsonRecord): JsonRecord {
  return {
    ...hooksBlock,
    SessionStart: appendConfigLoader(hooksBlock.SessionStart, "SessionStart"),
    UserPromptSubmit: appendConfigLoader(hooksBlock.UserPromptSubmit, "UserPromptSubmit"),
  }
}

const SISYPHUS_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "PreCompact",
  "Notification",
] as const

function addSisyphusHooks(hooksBlock: JsonRecord): JsonRecord {
  const next = { ...hooksBlock }
  for (const eventName of SISYPHUS_HOOK_EVENTS) {
    next[eventName] = appendSisyphusHook(next[eventName], eventName)
  }
  return next
}

function appendSisyphusHook(groups: unknown, eventName: string): readonly unknown[] {
  const current = Array.isArray(groups) ? groups : []
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${SISYPHUS_HOOKS_FILE}"`
  const withoutOld = current.filter((group) => !groupHasSisyphusCommand(group, command))
  return [
    ...withoutOld,
    {
      hooks: [
        {
          type: "command",
          command,
          timeout: 5,
          description: `lfg sisyphus orchestration (${eventName})`,
          statusMessage: `Sisyphus: ${eventName} orchestration context`,
        },
      ],
    },
  ]
}

function groupHasSisyphusCommand(group: unknown, command: string): boolean {
  if (typeof group !== "object" || group === null) return false
  const hooks = (group as JsonRecord).hooks
  if (!Array.isArray(hooks)) return false
  return hooks.some((handler) => {
    if (typeof handler !== "object" || handler === null) return false
    const h = handler as JsonRecord
    return h.command === command
  })
}

function appendConfigLoader(groups: unknown, eventName: string): readonly unknown[] {
  const current = Array.isArray(groups) ? groups : []
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${CONFIG_LOADER_FILE}"`
  const targetStatusMessage = `LFG: Loading global config and project context (${eventName})`

  // Filter out any existing (possibly stale) config loader entries, then add the current one.
  // This ensures we never have duplicates and always have the latest statusMessage.
  const withoutOldLoader = current.filter((group) => !groupHasConfigLoaderCommand(group, command))
  const withUpdatedLoader = [
    ...withoutOldLoader,
    {
      hooks: [{
        type: "command",
        command,
        timeout: 5,
        description: `lfg global config loader (${eventName})`,
        statusMessage: targetStatusMessage,
      }],
    },
  ]
  return withUpdatedLoader
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

/** Returns true if this group contains a config loader with the given command (regardless of statusMessage). Used to deduplicate. */
function groupHasConfigLoaderCommand(group: unknown, command: string): boolean {
  if (typeof group !== "object" || group === null) return false
  const hooks = (group as JsonRecord).hooks
  if (!Array.isArray(hooks)) return false
  return hooks.some((handler) => {
    if (typeof handler !== "object" || handler === null) return false
    const h = handler as JsonRecord
    return h.command === command
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