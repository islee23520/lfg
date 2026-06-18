const PLUGIN_ROOT_PLACEHOLDER = /\$\{PLUGIN_ROOT\}/g
const BRIDGE_MARKER = "lfg-grok-hook-bridge.mjs"

export function normalizeHookCommandPaths(command: string): string {
  return command.replace(PLUGIN_ROOT_PLACEHOLDER, "${GROK_PLUGIN_ROOT}")
}

export function wrapLazyCodexHookCommand(command: string): string {
  let trimmed = command.trim()
  if (!/^node\s+/i.test(trimmed)) {
    return command
  }

  while (true) {
    const match = trimmed.match(/^node\s+("(?:[^"\\]|\\.)*"|[^\s]+)\s*(.*)$/i)
    if (!match) break
    const first = match[1] ?? ""
    const rest = (match[2] ?? "").trim()
    if (first.toLowerCase().includes(BRIDGE_MARKER)) {
      if (rest.length === 0) break
      trimmed = rest.startsWith("node ") ? rest : `node ${rest}`
      continue
    }
    break
  }

  if (!trimmed.includes("/components/") && !trimmed.includes("/scripts/")) {
    return command
  }

  const match = trimmed.match(/^node\s+("(?:[^"\\]|\\.)*"|[^\s]+)\s*(.*)$/i)
  if (!match) {
    return command
  }
  const nodeTarget = match[1] ?? ""
  const rest = match[2] ?? ""
  const bridge = '"${GROK_PLUGIN_ROOT}/hooks/lfg-grok-hook-bridge.mjs"'
  return `node ${bridge} node ${nodeTarget}${rest.length > 0 ? ` ${rest}` : ""}`
}
