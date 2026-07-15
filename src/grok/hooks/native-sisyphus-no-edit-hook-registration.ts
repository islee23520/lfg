export const NATIVE_SISYPHUS_NO_EDIT_FILE = "lfg-native-sisyphus-no-edit.mjs" as const

type JsonRecord = Record<string, unknown>

/** Edit-class tools + shell that CEO agents must not use for product mutation. */
const PRE_TOOL_MATCHER =
  "^(search_replace|multi_edit|multiedit|MultiEdit|edit|Edit|write|Write|apply_patch|ApplyPatch|str_replace|StrReplace|create_file|CreateFile|delete_file|DeleteFile|bash|Bash|shell|Shell|run_terminal_command|run_command)$"

export function addNativeSisyphusNoEditHooks(hooksBlock: JsonRecord): JsonRecord {
  const current = Array.isArray(hooksBlock.PreToolUse) ? hooksBlock.PreToolUse : []
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_SISYPHUS_NO_EDIT_FILE}"`
  const withoutExisting = current.filter((group) => !groupHasCommand(group, command))
  return {
    ...hooksBlock,
    PreToolUse: [
      ...withoutExisting,
      {
        matcher: PRE_TOOL_MATCHER,
        hooks: [
          {
            type: "command",
            command,
            timeout: 5,
            description: "lfg CEO lock: Sisyphus/Watcher/Explorer cannot edit — hand off to Codex",
            statusMessage: "LFG: Block CEO product edits → Codex only",
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
    return (handler as JsonRecord).command === command
  })
}
