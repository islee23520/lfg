import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

type JsonRecord = Record<string, unknown>

const ACTIVE_GROK_HOOKS_FILE = "lfg-hooks.json" as const
const LIFECYCLE_EVENTS_WITHOUT_MATCHERS = new Set(["SessionStart", "Stop", "Notification", "SubagentStart", "SubagentStop"])

export function activeGrokHooksPath(pluginRoot: string): string {
  return `${dirname(dirname(pluginRoot))}/hooks/${ACTIVE_GROK_HOOKS_FILE}`
}

export async function materializeActiveGrokHooksJson(
  pluginRoot: string,
  payload: unknown,
): Promise<{ readonly path: string; readonly changed: boolean }> {
  const activePath = activeGrokHooksPath(pluginRoot)
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
