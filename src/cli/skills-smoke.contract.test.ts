import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("assert-skills-smoke gate", () => {
  test("package.json wires assert-skills-smoke into verify", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.["assert-skills-smoke"]).toBe("node scripts/assert-skills-smoke.mjs")
    expect(pkg.scripts?.verify).toContain("assert-skills-smoke")
  })

  test("scripts/assert-skills-smoke.mjs passes for every package skill", async () => {
    const { stdout } = await execFileAsync("node", [join(ROOT, "scripts", "assert-skills-smoke.mjs"), "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 4_000_000,
    })
    const summary = JSON.parse(stdout) as {
      ok: boolean
      skillCount: number
      skills: string[]
      failures: string[]
      reports: Array<{ skill: string; ok: boolean }>
    }
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
    expect(summary.skillCount).toBeGreaterThanOrEqual(30)
    expect(summary.skills).toContain("teammode")
    expect(summary.skills).toContain("ulw-plan")
    expect(summary.skills).toContain("xai")
    expect(summary.reports.every((r) => r.ok)).toBe(true)
  }, 120_000)
})
