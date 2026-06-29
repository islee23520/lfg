import { access, copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createNativeGrokHooksForLegacyFallback, isGrokEventHooksJson, isLegacyMetadataHooksJson, validateGrokHooksJson } from "./hook-trust"
import { normalizeHookCommandPaths, wrapLazyCodexHookCommand } from "./hook-command-normalization"
import { materializeActiveGrokHooksJson } from "./normalize-plugin-hooks-active"
import { resolveGrokHookBridgeAssetPath } from "./resolve-hook-bridge-asset"
import { addCommentCheckerHook, NATIVE_COMMENT_CHECKER_FILE } from "./comment-checker-hook"

const BRIDGE_RELATIVE = join("hooks", "lfg-grok-hook-bridge.mjs")
const CONFIG_LOADER_FILE = "lfg-config-loader.mjs" as const
const PROJECT_OMO_LEDGER_FILE = "lfg-project-omo-ledger.mjs" as const
const SISYPHUS_HOOKS_FILE = "lfg-sisyphus-hooks.mjs" as const
const NATIVE_RULES_FILE = "lfg-native-rules.mjs" as const
const NATIVE_ULTRAWORK_FILE = "lfg-native-ultrawork.mjs" as const
const DEV_LOGGER_FILE = "lfg-dev-logger.mjs" as const
const CONFIG_LOADER_RELATIVE = join("hooks", CONFIG_LOADER_FILE)
const PLUGIN_HOOKS_FILE = "hooks.json" as const
const PLUGIN_HOOKS_SOURCE_FILE = "hooks.source.json" as const

type JsonRecord = Record<string, unknown>

export async function syncGrokHookBridgeIntoPlugin(pluginRoot: string): Promise<string> {
  const assetPath = await resolveGrokHookBridgeAssetPath()
  const destPath = join(pluginRoot, BRIDGE_RELATIVE)
  await mkdir(dirname(destPath), { recursive: true })
  await copyFile(assetPath, destPath)
  await copyFile(await resolveAssetNearBridge(assetPath, "config", CONFIG_LOADER_FILE), join(pluginRoot, CONFIG_LOADER_RELATIVE))
  await copyFile(await resolveAssetNearBridge(assetPath, "ledger", PROJECT_OMO_LEDGER_FILE), join(pluginRoot, "hooks", PROJECT_OMO_LEDGER_FILE))
  await copyFile(await resolveAssetNearBridge(assetPath, "hooks", SISYPHUS_HOOKS_FILE), join(pluginRoot, "hooks", SISYPHUS_HOOKS_FILE))
  await copyFile(await resolveAssetNearBridge(assetPath, "hooks", NATIVE_RULES_FILE), join(pluginRoot, "hooks", NATIVE_RULES_FILE))
  await copyFile(await resolveAssetNearBridge(assetPath, "hooks", NATIVE_ULTRAWORK_FILE), join(pluginRoot, "hooks", NATIVE_ULTRAWORK_FILE))
  await copyFile(await resolveAssetNearBridge(assetPath, "hooks", NATIVE_COMMENT_CHECKER_FILE), join(pluginRoot, "hooks", NATIVE_COMMENT_CHECKER_FILE))
  await copyFile(await resolveAssetNearBridge(assetPath, "log", DEV_LOGGER_FILE), join(pluginRoot, "hooks", DEV_LOGGER_FILE))
  // .mcp.json is written by materializeGrokMcpRuntimes() during installGrokPluginFromSource — do not overwrite here with dev-only absolute paths.
  return destPath
}

async function resolveAssetNearBridge(bridgePath: string, sourceGroup: string, fileName: string): Promise<string> {
  const bridgeDir = dirname(bridgePath)
  const candidates = [join(bridgeDir, fileName), join(bridgeDir, "..", sourceGroup, fileName)]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try next candidate
    }
  }
  return candidates[0]!
}

export async function normalizePluginHooksJson(pluginRoot: string): Promise<{
  readonly path: string
  readonly changed: boolean
  readonly hookNames: readonly string[]
}> {
  /** T6 native first-party: uses validateGrokHooksJson + GROK_HOOK_EVENTS allowlist from hook-trust.
   * Bridge wrapping retained only for legacy/imported hook JSON (idempotent peel+wrap). Fixture provides first-party event-map. */
  await syncGrokHookBridgeIntoPlugin(pluginRoot)
  const hooksPath = join(pluginRoot, "hooks", PLUGIN_HOOKS_FILE)
  const sourceHooksPath = join(pluginRoot, "hooks", PLUGIN_HOOKS_SOURCE_FILE)
  const { path: sourcePath, raw } = await readSourceHooksJson(sourceHooksPath, hooksPath)
  let parsed: unknown = JSON.parse(raw)
  if (isLegacyMetadataHooksJson(parsed)) {
    parsed = createNativeGrokHooksForLegacyFallback()
  } else if (!isGrokEventHooksJson(parsed)) {
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
  const nextPayload = { hooks: addSisyphusHooks(addCommentCheckerHook(addLfgConfigLoaderHooks(nextBlock))) }
  const trust = validateGrokHooksJson(nextPayload)
  if (!trust.ok) {
    throw new Error(trust.error ?? "invalid hooks after normalize")
  }
  const nextText = `${JSON.stringify(nextPayload, null, 2)}\n`
  if (changed || nextText !== raw) {
    await writeFile(sourceHooksPath, nextText, "utf8")
  } else if (sourcePath !== sourceHooksPath) {
    await writeFile(sourceHooksPath, nextText, "utf8")
  }
  const active = await materializeActiveGrokHooksJson(pluginRoot, nextPayload)
  const removedPluginHooks = await removePluginHookRegistration(hooksPath)
  return { path: active.path, changed: changed || nextText !== raw || active.changed || removedPluginHooks, hookNames: trust.hookNames }
}

async function readSourceHooksJson(
  sourceHooksPath: string,
  hooksPath: string,
): Promise<{ readonly path: string; readonly raw: string }> {
  try {
    return { path: sourceHooksPath, raw: await readFile(sourceHooksPath, "utf8") }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { path: hooksPath, raw: await readFile(hooksPath, "utf8") }
    }
    throw error
  }
}

async function removePluginHookRegistration(hooksPath: string): Promise<boolean> {
  try {
    await unlink(hooksPath)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false
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
  return groupHasCommand(group, command)
}

function groupHasCommand(group: unknown, command: string): boolean {
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
  const next = normalizeFirstPartyHookCommand(wrapLazyCodexHookCommand(normalizeHookCommandPaths(h.command)))
  if (next === h.command) {
    return handler
  }
  onChange()
  return { ...h, command: next }
}

function normalizeFirstPartyHookCommand(command: string): string {
  const event = hookEventArg(command)
  if (event === null) {
    return command
  }
  if (command.includes("/components/rules/dist/cli.js")) {
    return `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_RULES_FILE}" ${event}`
  }
  if (command.includes("/components/ultrawork/dist/cli.js")) {
    return `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_ULTRAWORK_FILE}" ${event}`
  }
  return command
}

function hookEventArg(command: string): string | null {
  const match = command.match(/\bhook\s+([a-z0-9-]+)\b/i)
  return match?.[1] ?? null
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}

export { normalizeHookCommandPaths, wrapLazyCodexHookCommand }
