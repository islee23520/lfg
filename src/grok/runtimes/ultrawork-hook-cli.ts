#!/usr/bin/env node
import { join } from "node:path"
import { runUlwLoopHookCli } from "../../core/omo/ulw-loop/codex-hook"

async function main(): Promise<void> {
  const pluginRoot = process.env.PLUGIN_ROOT ?? process.env.GROK_PLUGIN_ROOT
  await runUlwLoopHookCli(process.stdin, process.stdout, {
    includeUltraworkDirective: true,
    ...(pluginRoot === undefined ? {} : { ultraworkSkillFilePath: join(pluginRoot, "skills", "ulw-loop", "SKILL.md") }),
  })
}

main().catch((error: unknown) => {
  process.stderr.write(`LFG-ULTRAWORK-HOOK-ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
