import { createHookParityNativeGrokHooks } from "./hook-parity"

export type HookTrustResult = {
  readonly ok: boolean
  readonly hookNames: readonly string[]
  readonly error: string | null
}

export const GROK_HOOK_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionDenied",
  "Stop",
  "StopFailure",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "SubagentEnd",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
])

/** True when hooks.json uses Grok lifecycle event keys (not legacy metadata catalog). */
export function isGrokEventHooksJson(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false
  }
  const record = raw as Record<string, unknown>
  const hooks = record.hooks
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    return false
  }
  const events = Object.keys(hooks as Record<string, unknown>)
  if (events.length === 0) {
    return false
  }
  return true
}

export function isLegacyMetadataHooksJson(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false
  }
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.hooks)) {
    return false
  }
  const entries = record.hooks
  if (entries.length === 0) {
    return false
  }
  return entries.every(
    (entry) => typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).name === "string",
  )
}

/** Validate Grok plugin hooks.json (event map) for install/doctor trust. */
export function validateGrokHooksJson(raw: unknown): HookTrustResult {
  if (isLegacyMetadataHooksJson(raw)) {
    return {
      ok: false,
      hookNames: [],
      error: "hooks.json uses legacy metadata list; expected Grok event map (hooks.SessionStart, etc.)",
    }
  }
  if (!isGrokEventHooksJson(raw)) {
    return { ok: false, hookNames: [], error: "hooks.json must be an object with hooks.<Event> arrays" }
  }
  const record = raw as { hooks: Record<string, unknown> }
  const hookNames: string[] = []
  for (const [eventName, groups] of Object.entries(record.hooks)) {
    if (!GROK_HOOK_EVENTS.has(eventName)) {
      return { ok: false, hookNames: [], error: `unknown Grok hook event: ${eventName}` }
    }
    if (!Array.isArray(groups)) {
      return { ok: false, hookNames: [], error: `hooks.${eventName} must be an array` }
    }
    for (const group of groups) {
      if (typeof group !== "object" || group === null) {
        return { ok: false, hookNames: [], error: `hooks.${eventName} entry must be an object` }
      }
      const inner = (group as Record<string, unknown>).hooks
      if (inner !== undefined && !Array.isArray(inner)) {
        return { ok: false, hookNames: [], error: `hooks.${eventName} handler list must be an array` }
      }
      if (Array.isArray(inner)) {
        for (const handler of inner) {
          if (typeof handler !== "object" || handler === null) {
            return { ok: false, hookNames: [], error: "hook handler must be an object" }
          }
          const type = (handler as Record<string, unknown>).type
          if (type === "command") {
            const command = (handler as Record<string, unknown>).command
            if (typeof command !== "string" || command.length === 0) {
              return { ok: false, hookNames: [], error: "command hook requires non-empty command" }
            }
          }
        }
      }
    }
    hookNames.push(eventName)
  }
  hookNames.sort((a, b) => a.localeCompare(b))
  if (hookNames.length === 0) {
    return { ok: false, hookNames: [], error: "no recognized Grok hook events" }
  }
  return { ok: true, hookNames, error: null }
}

/** T6: First-party native lfg/OMO event-map (no bridge wrapper). Legacy/imported gets bridge fallback. Uses full allowlist. */
export function createNativeGrokHooksForLegacyFallback(): unknown {
  const hooks: Record<string, unknown[]> = {}
  for (const eventName of GROK_HOOK_EVENTS) {
    const lowerEvent = eventName
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
    const command = `node "\${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs" node "\${GROK_PLUGIN_ROOT}/components/ultrawork/dist/cli.js" hook ${lowerEvent}`
    hooks[eventName] = [
      {
        hooks: [
          {
            type: "command",
            command,
            timeout: 5,
            description: `lfg legacy/imported fallback ${eventName} hook`,
          },
        ],
      },
    ]
  }
  return { hooks }
}

export function createFirstPartyNativeGrokHooks(): unknown {
  return createHookParityNativeGrokHooks()
}
