function extractModelName(model: string): string {
  return model.includes("/") ? (model.split("/").pop() ?? model) : model
}

const CLAUDE_OPUS_VERSION_RE = /claude-opus-(\d+)-(\d+)/

/**
 * Claude Fable shares the Opus 4.7+ request surface (adaptive thinking only,
 * explicit enabled-thinking budgets rejected), so it counts as "4.7 or later".
 */
export function isClaudeOpus47OrLaterModel(model: string): boolean {
  const modelName = extractModelName(model).toLowerCase().replaceAll(".", "-")
  if (modelName.includes("claude-fable")) return true
  const match = CLAUDE_OPUS_VERSION_RE.exec(modelName)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  if (Number.isNaN(major) || Number.isNaN(minor)) return false
  return major > 4 || (major === 4 && minor >= 7)
}
