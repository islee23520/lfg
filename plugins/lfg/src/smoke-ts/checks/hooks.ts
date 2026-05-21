import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { assert } from "../assert"
import { runCommand } from "../command"
import { safeCreateHook, todoContinuationReminder, type HookSnapshot } from "../../hooks-ts"
import type { SmokeCheck } from "../types"

export const hookSmoke: SmokeCheck = {
  name: "hook-smoke",
  run(context) {
    const env = {
      ...context.env,
      GROK_PLUGIN_ROOT: context.paths.pluginRoot,
      GROK_PLUGIN_DATA: context.tempDir,
      GROK_HOOK_EVENT: "PreToolUse",
    }
    runCommand(["bun", join(context.paths.pluginRoot, "hooks/scripts/lfg-audit-hook.ts")], {
      cwd: context.paths.repoRoot,
      env,
      input: '{"tool":"bash","args":"xai-SECRET ghp_SECRET"}',
    })
    const log = join(context.tempDir, "events/audit.jsonl")
    assert(existsSync(log) && statSync(log).size > 0, `missing audit log ${log}`)
    const text = readFileSync(log, "utf8")
    assert(!text.includes("xai-SECRET") && !text.includes("ghp_SECRET"), "audit log leaked token-like strings")
    return [`hook-smoke=ok log=${log}`]
  },
}

export const hookBridgePytest: SmokeCheck = {
  name: "hook-bridge-smoke",
  async run(context) {
    assert(existsSync(join(context.paths.pluginRoot, "src/hooks-ts/index.ts")), "missing Bun hook bridge source")
    const previousData = process.env.GROK_PLUGIN_DATA
    process.env.GROK_PLUGIN_DATA = context.tempDir
    try {
      const safe = safeCreateHook(async () => {
        throw new Error("fixture failure")
      })
      const safeResult = await safe({})
      assert(safeResult.ok === false && safeResult.status === "fail_open", "safeCreateHook must fail open")
      const snapshot: HookSnapshot = {
        boulder: {
          next_actions: [{ id: "1", goal: "verify Bun hook continuation", status: "pending" }],
          recent_evidence: [{ id: "e1", type: "checkpoint" }],
        },
        active_runs: [],
      }
      const reminder = todoContinuationReminder(snapshot, "PostToolUse")
      assert(reminder.includes("TODO CONTINUATION"), "todo continuation reminder must be emitted for incomplete work plus evidence")
    } finally {
      if (previousData === undefined) delete process.env.GROK_PLUGIN_DATA
      else process.env.GROK_PLUGIN_DATA = previousData
    }
    return ["hook-bridge-smoke=ok", "todo-continuation=ok"]
  },
}
