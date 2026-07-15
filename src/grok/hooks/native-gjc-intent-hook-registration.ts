export const NATIVE_GJC_INTENT_FILE = "lfg-native-gjc-intent.mjs" as const

export function addNativeGjcIntentHooks(hooksBlock: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const current = Array.isArray(hooksBlock.UserPromptSubmit) ? hooksBlock.UserPromptSubmit : []
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_GJC_INTENT_FILE}"`
  const withoutExisting = current.filter((group) => !groupHasCommand(group, command))
  return {
    ...hooksBlock,
    UserPromptSubmit: [
      ...withoutExisting,
      {
        hooks: [{
          type: "command",
          command,
          timeout: 12,
          description: "lfg gjc intent and ambiguity gateway",
          statusMessage: "LFG: Classifying intent with gjc",
        }],
      },
    ],
  }
}

function groupHasCommand(group: unknown, command: string): boolean {
  if (typeof group !== "object" || group === null) return false
  const hooks = (group as { readonly hooks?: unknown }).hooks
  if (!Array.isArray(hooks)) return false
  return hooks.some((hook) =>
    typeof hook === "object" && hook !== null && (hook as { readonly command?: unknown }).command === command,
  )
}
