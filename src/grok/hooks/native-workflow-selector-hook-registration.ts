export const NATIVE_WORKFLOW_SELECTOR_FILE = "lfg-native-workflow-selector.mjs" as const

type JsonRecord = Record<string, unknown>

export function addNativeWorkflowSelectorHook(hooksBlock: JsonRecord): JsonRecord {
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_WORKFLOW_SELECTOR_FILE}"`
  const current = Array.isArray(hooksBlock.UserPromptSubmit) ? hooksBlock.UserPromptSubmit : []
  return {
    ...hooksBlock,
    UserPromptSubmit: [
      ...removeExistingSelector(current, command),
      {
        hooks: [
          {
            type: "command",
            command,
            timeout: 5,
            description: "lfg opt-in workflow selector",
            statusMessage: "LFG: Selecting workflow when enabled",
          },
        ],
      },
    ],
  }
}

function removeExistingSelector(groups: readonly unknown[], command: string): readonly unknown[] {
  return groups.flatMap((group) => removeSelectorCommand(group, command))
}

function removeSelectorCommand(group: unknown, command: string): readonly unknown[] {
  if (!isRecord(group) || !Array.isArray(group.hooks)) return [group]
  const hooks = group.hooks.filter((handler) => !(isRecord(handler) && handler.command === command))
  if (hooks.length === group.hooks.length) return [group]
  return hooks.length === 0 ? [] : [{ ...group, hooks }]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
