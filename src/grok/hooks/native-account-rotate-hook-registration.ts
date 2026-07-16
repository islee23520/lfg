export const NATIVE_ACCOUNT_ROTATE_FILE = "lfg-native-account-rotate.mjs" as const

type JsonRecord = Record<string, unknown>

const EVENTS = ["UserPromptSubmit"] as const

export function addNativeAccountRotateHooks(hooksBlock: JsonRecord): JsonRecord {
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_ACCOUNT_ROTATE_FILE}"`
  let next = Object.fromEntries(Object.entries(hooksBlock).map(([eventName, groups]) => [
    eventName,
    Array.isArray(groups) ? groups.filter((group) => !groupHasCommand(group, command)) : groups,
  ]))
  for (const eventName of EVENTS) {
    const current = Array.isArray(next[eventName]) ? next[eventName] : []
    next = {
      ...next,
      [eventName]: [
        ...current.filter((group) => !groupHasCommand(group, command)),
        {
          hooks: [{
            type: "command",
            command,
            timeout: 5,
            description: `lfg account round-robin rotation (${eventName})`,
            statusMessage: "LFG: Selecting Grok account",
          }],
        },
      ],
    }
  }
  return next
}

function groupHasCommand(group: unknown, command: string): boolean {
  if (typeof group !== "object" || group === null) return false
  const hooks = (group as JsonRecord).hooks
  return Array.isArray(hooks) && hooks.some((handler) =>
    typeof handler === "object" && handler !== null && (handler as JsonRecord).command === command)
}
