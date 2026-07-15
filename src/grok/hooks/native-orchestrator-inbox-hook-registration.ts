export const NATIVE_ORCHESTRATOR_INBOX_FILE = "lfg-native-orchestrator-inbox.mjs" as const

type JsonRecord = Record<string, unknown>

const EVENTS = ["SessionStart", "UserPromptSubmit", "Stop"] as const

export function addNativeOrchestratorInboxHooks(hooksBlock: JsonRecord): JsonRecord {
  let next = { ...hooksBlock }
  for (const eventName of EVENTS) {
    const current = Array.isArray(next[eventName]) ? (next[eventName] as unknown[]) : []
    const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_ORCHESTRATOR_INBOX_FILE}"`
    const without = current.filter((group) => !groupHasCommand(group, command))
    next = {
      ...next,
      [eventName]: [
        ...without,
        {
          hooks: [
            {
              type: "command",
              command,
              timeout: 5,
              description: `lfg orchestrator inbox (${eventName})`,
              statusMessage: "LFG: Multi-Codex orchestrator inbox monitor",
            },
          ],
        },
      ],
    }
  }
  return next
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
