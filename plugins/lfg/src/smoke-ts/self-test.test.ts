import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { join, resolve } from "node:path"
import { EXPECTED_EVIDENCE_STRINGS, isEvidenceLine } from "./manifest"

const repoRoot = resolve(import.meta.dir, "../../../../")
const selfTest = join(repoRoot, "plugins/lfg/bin/self-test.ts")

describe("Bun self-test", () => {
  test("declares Python self-test evidence strings in valid format", () => {
    expect(EXPECTED_EVIDENCE_STRINGS).toContain("agents-guides-valid=ok")
    expect(EXPECTED_EVIDENCE_STRINGS).toContain("runtime-smoke-coverage=100%")
    for (const evidence of EXPECTED_EVIDENCE_STRINGS) expect(isEvidenceLine(evidence)).toBe(true)
  })

  test("runs and produces expected evidence output", () => {
    const result = spawnSync("bun", [selfTest], {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf8",
      timeout: 180_000,
    })
    expect(result.status).toBe(0)
    const output = `${result.stdout}${result.stderr}`
    for (const evidence of EXPECTED_EVIDENCE_STRINGS) expect(output).toContain(evidence)
    expect(output).toContain("self-test-summary=ok passed=")
    expect(output).toContain("failed=0")
  })

  test("returns exit code 1 when a smoke bootstrap failure is injected", () => {
    const result = spawnSync("bun", [selfTest], {
      cwd: repoRoot,
      env: { ...process.env, LFG_SELF_TEST_INJECT_FAILURE: "1" },
      encoding: "utf8",
      timeout: 60_000,
    })
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain("self-test-bootstrap=failed")
  })
})
