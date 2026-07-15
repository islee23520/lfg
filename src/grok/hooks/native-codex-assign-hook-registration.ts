/**
 * Word / skill-assign UserPromptSubmit hook registration.
 * Purpose: help Grok task Codex LazyCodex — not multi-agent zoo.
 */
export const NATIVE_CODEX_ASSIGN_FILE = "lfg-native-codex-assign.mjs" as const

type JsonRecord = Record<string, unknown>

export function addNativeCodexAssignHooks(hooksBlock: JsonRecord): JsonRecord {
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_CODEX_ASSIGN_FILE}"`
  return {
    ...hooksBlock,
    SessionStart: appendAssignHook(hooksBlock.SessionStart, command, "Codex startup requirement"),
    UserPromptSubmit: appendAssignHook(hooksBlock.UserPromptSubmit, command, "Word skill-assign for Grok→Codex handoff"),
  }
}

function appendAssignHook(groups: unknown, command: string, label: string): readonly unknown[] {
  const current = Array.isArray(groups) ? groups : []
  return [
    ...current.filter((group) => !groupHasCommand(group, command)),
    {
      hooks: [{ type: "command", command, timeout: 5, description: `lfg ${label}`, statusMessage: `LFG: ${label}` }],
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
