#!/usr/bin/env node

const BASH_DEFAULT_TIMEOUT_SECONDS = 120
const BASH_MAX_TIMEOUT_SECONDS = 600

function parsePositiveInt(value) {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function resolveDefaults() {
  const defaultSeconds =
    parsePositiveInt(process.env.LFG_BASH_DEFAULT_TIMEOUT_SECONDS) ?? BASH_DEFAULT_TIMEOUT_SECONDS
  const rawMax =
    parsePositiveInt(process.env.LFG_BASH_MAX_TIMEOUT_SECONDS) ?? BASH_MAX_TIMEOUT_SECONDS
  return { defaultSeconds, maxSeconds: Math.max(rawMax, defaultSeconds) }
}

function buildPrompt(defaults) {
  const minutes = (seconds) => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`)
  return `\n## Bash Tool Timeout Policy\n\nThe \`bash\` tool enforces timeouts even when you omit the \`timeout\` parameter:\n\n- Default timeout: ${defaults.defaultSeconds}s (${minutes(defaults.defaultSeconds)}). Applied automatically when you do not set \`timeout\`.\n- Recommended maximum timeout: ${defaults.maxSeconds}s (${minutes(defaults.maxSeconds)}). Explicit \`timeout\` values you set are preserved because different hosts may use different timeout units.\n- For long-running commands (builds, installs, test suites), set an explicit \`timeout\` that fits the workload. Do not assume commands run forever.\n- For commands that legitimately need to run beyond the recommended maximum, run them in the background via tmux or a similar mechanism instead of relying on the bash timeout.\n`
}

function recordField(record, key) {
  if (record !== null && typeof record === "object" && Object.hasOwn(record, key)) {
    const value = record[key]
    return typeof value === "string" ? value : null
  }
  return null
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      raw += chunk
    })
    process.stdin.on("end", () => resolve(raw))
    process.stdin.on("error", () => resolve(""))
  })
}

async function main() {
  const raw = await readStdin()
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return 0
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return 0
  }
  const toolName =
    recordField(payload, "toolName") ?? recordField(payload, "tool_name")
  if (toolName === null) {
    return 0
  }
  if (!/^(bash|Bash|shell|run_command)$/.test(toolName)) {
    return 0
  }
  const context = buildPrompt(resolveDefaults())
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: context,
      },
    })}\n`,
  )
  return 0
}

main().then((code) => process.exit(code))
