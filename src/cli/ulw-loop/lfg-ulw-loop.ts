#!/usr/bin/env node
/**
 * lfg-owned durable ulw-loop CLI.
 * Host-neutral core: src/core/omo/ulw-loop (ported from upstream omo-codex ulw-loop).
 * Exposed as: lfg ulw-loop | lfg ulw
 *
 * This module is imported by the main lfg CLI bundle. Do NOT auto-run on import:
 * esbuild collapses import.meta.url to the host entry, which would hijack `lfg help`.
 */
import { isUlwLoopSubcommand, ulwLoopCommand } from "../../core/omo/ulw-loop/cli-commands.js"
import { runPreToolUseGoalBudgetGuardCli, runUlwLoopHookCli } from "../../core/omo/ulw-loop/codex-hook.js"

const TOP_LEVEL_HELP =
  "Usage:\n" +
  "  lfg ulw-loop <subcommand> [args]\n" +
  "  lfg ulw <subcommand> [args]                 (alias)\n" +
  "  lfg ulw-loop hook user-prompt-submit [--with-ultrawork]\n" +
  "  lfg ulw-loop hook pre-tool-use\n" +
  "  lfg ulw-loop help | --help | -h\n\n" +
  "Run `lfg ulw-loop help` for subcommands.\n" +
  "State lives under .omo/ulw-loop/ (optional --session-id).\n"

export async function dispatchUlwLoopArgv(argv: readonly string[]): Promise<number> {
  const command = argv[0]
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(TOP_LEVEL_HELP)
    return 0
  }
  if (command === "ulw-loop" || command === "ulw") {
    return ulwLoopCommand(argv.slice(1))
  }
  if (command === "hook") {
    const sub = argv[1]
    if (sub === "user-prompt-submit") {
      await runUlwLoopHookCli(process.stdin, process.stdout, {
        includeUltraworkDirective: argv.includes("--with-ultrawork"),
      })
      return 0
    }
    if (sub === "pre-tool-use") {
      await runPreToolUseGoalBudgetGuardCli(process.stdin, process.stdout)
      return 0
    }
    process.stderr.write(`[lfg ulw-loop] unknown hook subcommand: ${sub ?? "(none)"}\n`)
    return 1
  }
  if (isUlwLoopSubcommand(command)) return ulwLoopCommand(argv)
  process.stderr.write(`[lfg ulw-loop] unknown command: ${command}\n${TOP_LEVEL_HELP}`)
  return 1
}
