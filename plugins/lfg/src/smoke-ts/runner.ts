import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SELF_TEST_CHECKS } from "./checks"
import { EXPECTED_EVIDENCE_STRINGS } from "./manifest"
import { smokePaths } from "./paths"
import type { SmokeCheck, SmokeContext } from "./types"

export type SelfTestRunResult = {
  ok: boolean
  passed: number
  failed: number
  evidence: string[]
}

export async function runSelfTest(options: { checks?: SmokeCheck[]; env?: NodeJS.ProcessEnv } = {}): Promise<SelfTestRunResult> {
  const paths = smokePaths()
  const tempDir = mkdtempSync(join(tmpdir(), "lfg-smoke-ts-"))
  const context: SmokeContext = {
    paths,
    tempDir,
    env: options.env ?? process.env,
  }
  const checks = options.checks ?? SELF_TEST_CHECKS
  const evidence: string[] = []
  let passed = 0
  let failed = 0
  try {
    if (context.env.LFG_SELF_TEST_INJECT_FAILURE === "1") throw new Error("injected self-test failure")
    for (const check of checks) {
      try {
        const lines = await check.run(context)
        for (const line of lines) {
          evidence.push(line)
          console.log(line)
        }
        passed += 1
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.stack ?? error.message : String(error)
        console.error(`${check.name}=failed`)
        console.error(message)
      }
    }
  } catch (error) {
    failed += 1
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error("self-test-bootstrap=failed")
    console.error(message)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
  const missing = expectedEvidenceMissing(evidence)
  if (missing.length > 0) {
    failed += 1
    console.error(`evidence-contract=failed missing=${missing.join(",")}`)
  }
  console.log(`self-test-summary=ok passed=${passed} failed=${failed}`)
  return { ok: failed === 0, passed, failed, evidence }
}

export function expectedEvidenceMissing(actualLines: string[]): string[] {
  return EXPECTED_EVIDENCE_STRINGS.filter((expected) => !actualLines.some((line) => line === expected || line.startsWith(`${expected} `)))
}
