const NATIVE_BASH_TIMEOUT_FILE = "lfg-native-bash-timeout.mjs" as const

type JsonRecord = Record<string, unknown>

export { NATIVE_BASH_TIMEOUT_FILE }

export function addBashTimeoutHook(hooksBlock: JsonRecord): JsonRecord {
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_BASH_TIMEOUT_FILE}"`
  const current = Array.isArray(hooksBlock.PreToolUse) ? hooksBlock.PreToolUse : []
  const withoutOld = current.filter((group) => !groupHasCommand(group, command))
  return {
    ...hooksBlock,
    PreToolUse: [
      ...withoutOld,
      {
        matcher: "^(bash|Bash|shell|run_command)$",
        hooks: [
          {
            type: "command",
            command,
            timeout: 5,
            description: "lfg bash-timeout policy PreToolUse hook",
            statusMessage: "LFG: bash timeout policy",
          },
        ],
      },
    ],
  }
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
