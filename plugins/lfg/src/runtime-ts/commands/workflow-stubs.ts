import { parseArgs, utcNow, type CommandContext, type JsonRecord } from "./common"

export const WORKFLOW_STUB_COMMANDS = [
  "ultragoal",
  "ralph",
  "worker",
  "pipeline",
  "autopilot",
  "cleanup",
  "autoresearch",
  "deep-interview",
  "design",
  "notifications",
  "ask",
  "analyze",
  "code-review",
  "performance-goal",
  "visual-ralph",
  "wiki",
] as const

export type WorkflowStubCommand = typeof WORKFLOW_STUB_COMMANDS[number]

export function isWorkflowStubCommand(command: string): command is WorkflowStubCommand {
  return WORKFLOW_STUB_COMMANDS.includes(command as WorkflowStubCommand)
}

export function workflowStubCommand(command: WorkflowStubCommand, argv: string[], context: CommandContext = {}): JsonRecord {
  const parsed = parseArgs(argv)
  return {
    ok: true,
    command,
    status: "accepted",
    compatibility: true,
    runtime: "typescript",
    received: {
      positional: parsed.positional,
      flags: Object.fromEntries(Object.entries(parsed.flags).map(([key, value]) => [key, value])) as JsonRecord,
    },
    evidence: `${command}-workflow-stub=ok`,
    ts: utcNow(context.now),
  }
}
