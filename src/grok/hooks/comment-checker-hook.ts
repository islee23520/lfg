const NATIVE_COMMENT_CHECKER_FILE = "lfg-native-comment-checker.mjs" as const

type JsonRecord = Record<string, unknown>

export { NATIVE_COMMENT_CHECKER_FILE }

export function addCommentCheckerHook(hooksBlock: JsonRecord): JsonRecord {
  const command = `node "\${GROK_PLUGIN_ROOT}/hooks/${NATIVE_COMMENT_CHECKER_FILE}"`
  const current = Array.isArray(hooksBlock.PostToolUse) ? hooksBlock.PostToolUse : []
  const withoutOld = current.filter((group) => !groupHasCommand(group, command))
  return {
    ...hooksBlock,
    PostToolUse: [
      ...withoutOld,
      {
        matcher: "^(apply_patch|edit|Edit|write|Write|search_replace|multi_edit|multiEdit|multiedit|MultiEdit)$",
        hooks: [
          {
            type: "command",
            command,
            timeout: 5,
            description: "lfg comment-checker post-edit hook",
            statusMessage: "LFG: Checking edited comments",
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
