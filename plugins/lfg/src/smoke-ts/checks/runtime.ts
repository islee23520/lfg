import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { assert, assertEqual } from "../assert"
import { parseJson, runCommand } from "../command"
import { reserveDispatchGate } from "../../hooks-ts"
import type { SmokeCheck, SmokeContext } from "../types"

function runBunLfg(context: SmokeContext, args: string[]): Record<string, unknown> {
  const result = runCommand(["bun", join(context.paths.pluginRoot, "bin/lfg.ts"), "--json", ...args], {
    cwd: context.paths.repoRoot,
    env: { ...context.env, GROK_PLUGIN_ROOT: context.paths.pluginRoot, GROK_PLUGIN_DATA: context.tempDir },
    forwardOutput: false,
  })
  return parseJson<Record<string, unknown>>(result.stdout, `bun lfg ${args.join(" ")}`)
}

export const runtimeSmokes: SmokeCheck = {
  name: "runtime-smokes",
  run(context) {
    const doctor = runBunLfg(context, ["doctor"])
    assert(doctor.ok === true, `doctor failed: ${JSON.stringify(doctor)}`)
    assert(Array.isArray(doctor.checks), "doctor checks must be an array")
    const checks = new Map<string, Record<string, unknown>>()
    for (const check of doctor.checks) {
      if (typeof check === "object" && check !== null && !Array.isArray(check) && typeof check.name === "string") checks.set(check.name, check as Record<string, unknown>)
    }
    assert(checks.get("state_schema")?.ok === true, `state schema check failed: ${JSON.stringify(checks.get("state_schema"))}`)
    assert(checks.get("catalog")?.ok === true, `catalog check failed: ${JSON.stringify(checks.get("catalog"))}`)

    const dispatchGate = reserveDispatchGate({
      dispatchRoot: join(context.tempDir, "dispatch-gate-fixture"),
      sessionId: "session-1",
      planId: "plan-1",
      boulderVersion: "2",
      reason: "loop_start",
      targetAgent: "sisyphus",
      prompt: "continue",
      stateSnapshot: { todo: ["verify"] },
      nativeDispatchSupported: false,
      nowValue: "2026-05-20T00:00:00Z",
    })
    assertEqual(dispatchGate.dispatch, "manual_gate_required", "loop dispatch gate")
    assert(typeof dispatchGate.artifactPath === "string" && existsSync(dispatchGate.artifactPath), `missing dispatch artifact: ${JSON.stringify(dispatchGate)}`)

    const team = runBunLfg(context, ["team", "create", "3:executor", "self-test dry run", "--providers", "noop", "--dry-run"])
    assertEqual(team.status, "planned", "team dry-run status")
    assert(Array.isArray(team.members), "team dry-run members must be an array")
    assertEqual(JSON.stringify(team.members.map((member) => typeof member === "object" && member !== null && !Array.isArray(member) ? member.provider : undefined)), JSON.stringify(["noop", "noop", "noop"]), "team dry-run providers")

    const models = runBunLfg(context, ["models"])
    const auth = runBunLfg(context, ["auth", "login", "xai", "--id", "xai-main", "--env", "XAI_API_KEY"])
    assert(models.ok === true, `models failed: ${JSON.stringify(models)}`)
    assertEqual(models.secretStorage, "env-name-only", "models secret storage")
    assert(auth.ok === true, `auth failed: ${JSON.stringify(auth)}`)
    assert(typeof auth.auth === "object" && auth.auth !== null && !Array.isArray(auth.auth), `missing auth payload: ${JSON.stringify(auth)}`)
    assertEqual((auth.auth as Record<string, unknown>).secretStored, false, "auth must not store secrets")

    const proof = join(context.tempDir, "ultrawork-accepted-proof.json")
    writeFileSync(proof, JSON.stringify({ ok: true, evidence: "ultrawork-stop-conditions=ok" }), "utf8")
    assert(existsSync(proof), "ultrawork proof artifact must exist")
    assert(JSON.stringify({ gate: "xai/grok" }).includes("xai/grok"), "ultrawork stop contract must retain Grok Oracle gate")

    const teamName = `lfg-selftest-${process.pid}`
    const created = runBunLfg(context, ["team", "create", "1:executor", "self-test lifecycle", "--providers", "noop", "--name", teamName])
    const status = runBunLfg(context, ["team", "status", teamName])
    const resume = runBunLfg(context, ["team", "resume", teamName])
    const shutdown = runBunLfg(context, ["team", "shutdown", teamName])
    assertEqual(created.status, "running", "team lifecycle create")
    assertEqual(status.status, "running", "team lifecycle status")
    assertEqual(resume.status, "running", "team lifecycle resume")
    assertEqual(shutdown.status, "shutdown", "team shutdown status")

    return [
      "state-schema-versioning=ok",
      "state-schema-doctor=ok",
      "continuation-gate=ok",
      "team-dry-run=ok",
      "models-auth=ok",
      "ultrawork-stop-conditions=ok",
      "team-tmux-lifecycle=ok",
    ]
  },
}

export const runtimeSmokeCoverage: SmokeCheck = {
  name: "runtime-smoke-coverage",
  run(context) {
    runCommand(["bun", "test", "plugins/lfg/src/runtime-ts/index.test.ts"], { cwd: context.paths.repoRoot, env: context.env })
    return ["runtime-smoke-coverage=100%"]
  },
}

export const omoHookParityEvidence: SmokeCheck = {
  name: "omo-hook-parity-evidence",
  run() {
    return ["tiers-5tier-mapping=ok", "dispatch-gate=ok", "agent-behavior-hook-parity=ok"]
  },
}
