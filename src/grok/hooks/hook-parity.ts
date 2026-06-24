export const OMO_HOOK_PARITY_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostCompact",
  "Stop",
  "SubagentStop",
] as const

export type OmoHookParityEvent = (typeof OMO_HOOK_PARITY_EVENTS)[number]

export type OmoHookParityStatus = "Grok-adapted" | "Deferred" | "Unsupported"

export type OmoHookParityRow = {
  readonly event: OmoHookParityEvent
  readonly upstreamMatcher: string | null
  readonly upstreamCommand: string
  readonly upstreamTimeoutSeconds: number
  readonly localTargetDecision: string
  readonly localCommand: string | null
  readonly localMatcher: string | null
  readonly localTimeoutSeconds: number | null
  readonly status: OmoHookParityStatus
}

export const OMO_HOOK_PARITY_MATRIX: readonly OmoHookParityRow[] = [
  {
    event: "SessionStart",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Use the lfg-native-rules Grok hook entrypoint, which adapts Grok payloads before invoking the installed rules component.",
    localCommand: 'node "${GROK_PLUGIN_ROOT}/hooks/lfg-native-rules.js" session-start',
    localMatcher: null,
    localTimeoutSeconds: 10,
    status: "Grok-adapted",
  },
  {
    event: "SessionStart",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/telemetry/dist/cli.js" hook session-start',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "Do not emit telemetry from lfg by default.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Unsupported",
  },
  {
    event: "SessionStart",
    upstreamMatcher: "^startup$",
    upstreamCommand: 'node "${PLUGIN_ROOT}/scripts/auto-update.mjs" hook session-start',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "Do not run auto-update from hooks; lfg updates stay user-controlled.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Unsupported",
  },
  {
    event: "SessionStart",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/bootstrap/dist/cli.js" hook session-start',
    upstreamTimeoutSeconds: 30,
    localTargetDecision: "Do not provision Codex bootstrap dependencies from Grok setup hooks.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "UserPromptSubmit",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook user-prompt-submit',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Use the lfg-native-rules Grok hook entrypoint, which adapts Grok payloads before invoking the installed rules component.",
    localCommand: 'node "${GROK_PLUGIN_ROOT}/hooks/lfg-native-rules.js" user-prompt-submit',
    localMatcher: null,
    localTimeoutSeconds: 10,
    status: "Grok-adapted",
  },
  {
    event: "UserPromptSubmit",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/ultrawork/dist/cli.js" hook user-prompt-submit',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "Use the lfg-native-ultrawork Grok hook entrypoint, which adapts Grok payloads before invoking the installed ultrawork component.",
    localCommand: 'node "${GROK_PLUGIN_ROOT}/hooks/lfg-native-ultrawork.js" user-prompt-submit',
    localMatcher: null,
    localTimeoutSeconds: 5,
    status: "Grok-adapted",
  },
  {
    event: "UserPromptSubmit",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/ulw-loop/dist/cli.js" hook user-prompt-submit',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Represent durable ULW loop state through lfg-config-loader instead of an uninstalled component CLI.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "PreToolUse",
    upstreamMatcher: "^Bash$",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/git-bash/dist/cli.js" hook pre-tool-use',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "Do not enable Git Bash reminders on macOS Grok installs.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "PreToolUse",
    upstreamMatcher: "^create_goal$",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/ulw-loop/dist/cli.js" hook pre-tool-use',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "Sisyphus native hook injects pre-tool guidance; no uninstalled ulw-loop CLI is referenced.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "PostToolUse",
    upstreamMatcher: "^(apply_patch|write|Write|edit|Edit|multi_edit|multiedit|MultiEdit)$",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/comment-checker/dist/cli.js" hook post-tool-use',
    upstreamTimeoutSeconds: 30,
    localTargetDecision: "Comment checker remains deferred until a Grok-native component is packaged.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "PostToolUse",
    upstreamMatcher: "^(apply_patch|write|Write|edit|Edit|multi_edit|multiedit|MultiEdit)$",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/lsp/dist/cli.js" hook post-tool-use',
    upstreamTimeoutSeconds: 60,
    localTargetDecision: "LSP hook remains deferred until a Grok-native component is packaged.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "PostToolUse",
    upstreamMatcher: "^apply_patch$",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook post-tool-use',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Use the lfg-native-rules Grok hook entrypoint, which adapts Grok payloads before invoking the installed rules component.",
    localCommand: 'node "${GROK_PLUGIN_ROOT}/hooks/lfg-native-rules.js" post-tool-use',
    localMatcher: "^apply_patch$",
    localTimeoutSeconds: 10,
    status: "Grok-adapted",
  },
  {
    event: "PostCompact",
    upstreamMatcher: "manual|auto",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/git-bash/dist/cli.js" hook post-compact',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "Git Bash reminder reset is not enabled for macOS Grok installs.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "PostCompact",
    upstreamMatcher: "manual|auto",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook post-compact',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Use the lfg-native-rules Grok hook entrypoint, which adapts Grok payloads before invoking the installed rules component.",
    localCommand: 'node "${GROK_PLUGIN_ROOT}/hooks/lfg-native-rules.js" post-compact',
    localMatcher: "manual|auto",
    localTimeoutSeconds: 10,
    status: "Grok-adapted",
  },
  {
    event: "PostCompact",
    upstreamMatcher: "manual|auto",
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/lsp/dist/cli.js" hook post-compact',
    upstreamTimeoutSeconds: 5,
    localTargetDecision: "LSP cache reset remains deferred until a Grok-native component is packaged.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "Stop",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/start-work-continuation/dist/cli.js" hook stop',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Sisyphus native Stop hook provides final-review context; start-work continuation CLI is not packaged.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
  {
    event: "SubagentStop",
    upstreamMatcher: null,
    upstreamCommand: 'node "${PLUGIN_ROOT}/components/start-work-continuation/dist/cli.js" hook subagent-stop',
    upstreamTimeoutSeconds: 10,
    localTargetDecision: "Sisyphus native SubagentStop hook provides delegation-result context; start-work continuation CLI is not packaged.",
    localCommand: null,
    localMatcher: null,
    localTimeoutSeconds: null,
    status: "Deferred",
  },
]

export function createHookParityNativeGrokHooks(): { readonly hooks: Record<OmoHookParityEvent, readonly unknown[]> } {
  const hooks: Record<OmoHookParityEvent, unknown[]> = {
    SessionStart: [],
    UserPromptSubmit: [],
    PreToolUse: [],
    PostToolUse: [],
    PostCompact: [],
    Stop: [],
    SubagentStop: [],
  }
  for (const row of OMO_HOOK_PARITY_MATRIX) {
    if (row.localCommand === null || row.localTimeoutSeconds === null) continue
    hooks[row.event].push({
      ...(row.localMatcher === null ? {} : { matcher: row.localMatcher }),
      hooks: [
        {
          type: "command",
          command: row.localCommand,
          timeout: row.localTimeoutSeconds,
          description: `lfg ${row.status} ${row.event} hook`,
        },
      ],
    })
  }
  return { hooks }
}
