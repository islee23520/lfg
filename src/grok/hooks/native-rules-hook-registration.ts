export const NATIVE_RULES_FILE = "lfg-native-rules.mjs" as const

type JsonRecord = Record<string, unknown>

type NativeRulesHookDefinition = {
  readonly eventName: "SessionStart" | "UserPromptSubmit" | "PostToolUse" | "PostCompact"
  readonly argument: "session-start" | "user-prompt-submit" | "post-tool-use" | "post-compact"
  readonly matcher?: string
}

const NATIVE_RULES_HOOK_DEFINITIONS: readonly NativeRulesHookDefinition[] = [
  { eventName: "SessionStart", argument: "session-start" },
  { eventName: "UserPromptSubmit", argument: "user-prompt-submit" },
  { eventName: "PostToolUse", argument: "post-tool-use", matcher: "^apply_patch$" },
  { eventName: "PostCompact", argument: "post-compact", matcher: "manual|auto" },
]

export function addNativeRulesHooks(hooksBlock: JsonRecord): JsonRecord {
  const next = { ...hooksBlock }
  for (const definition of NATIVE_RULES_HOOK_DEFINITIONS) {
    next[definition.eventName] = appendNativeRulesHook(next[definition.eventName], definition)
  }
  return next
}

function appendNativeRulesHook(groups: unknown, definition: NativeRulesHookDefinition): readonly unknown[] {
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_RULES_FILE}" ${definition.argument}`
  const current = Array.isArray(groups) ? groups : []
  const withoutExisting = current.flatMap((group) => removeNativeRulesCommand(group, command))
  return [
    ...withoutExisting,
    {
      ...(definition.matcher === undefined ? {} : { matcher: definition.matcher }),
      hooks: [
        {
          type: "command",
          command,
          timeout: 10,
          description: `lfg native rules (${definition.eventName})`,
          statusMessage: `LFG: Applying rules context (${definition.eventName})`,
        },
      ],
    },
  ]
}

function removeNativeRulesCommand(group: unknown, command: string): readonly unknown[] {
  if (!isRecord(group)) return [group]
  const hooks = group.hooks
  if (!Array.isArray(hooks)) return [group]
  const remaining = hooks.filter((handler) => !(isRecord(handler) && handler.command === command))
  if (remaining.length === hooks.length) return [group]
  if (remaining.length === 0) return []
  return [{ ...group, hooks: remaining }]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
