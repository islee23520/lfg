/**
 * Feature-level coverage inventory for the public lfg CLI surface.
 * Every advertised command must have at least one dedicated test file/glob match.
 * This is the "100% feature coverage" gate (contract), complementary to line coverage.
 */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

/** Public product features that must be smoke/contract tested. */
const FEATURES: ReadonlyArray<{ id: string; mustMatch: RegExp }> = [
  { id: "cli-help", mustMatch: /help|lfg-help|user-facing-copy|supported-commands/i },
  { id: "setup-plan-json", mustMatch: /setup-json|setup\.test|lfg\.test|setup-plan/i },
  { id: "setup-run-install", mustMatch: /run-grok-install|lfg-grok-install|plugin-cache-install|setup.*run/i },
  { id: "doctor", mustMatch: /doctor/i },
  { id: "set-tier", mustMatch: /set-tier|set-agent-service-tier|service.tier/i },
  { id: "xai-auth", mustMatch: /xai.*auth|xai-auth/i },
  { id: "mcp-companion", mustMatch: /companion|mcp/i },
  { id: "ulw-loop", mustMatch: /ulw-loop/i },
  { id: "hooks-normalize", mustMatch: /normalize-plugin-hooks|hook/i },
  { id: "skills-smoke", mustMatch: /skills-smoke|assert-skills/i },
  { id: "omo-parity", mustMatch: /assert-omo-parity|omo-parity|omo-skill/i },
  { id: "publish-pack", mustMatch: /assert-pack|npm-pack|publish/i },
  { id: "rules-engine", mustMatch: /rules/i },
  // v0.1.30 renamed the sisyphus hooks to codex-assign/orchestrator assets; the behavior is now covered by native-codex-assign-hook.test.ts.
  { id: "sisyphus-hooks", mustMatch: /sisyphus|codex-assign/i },
  { id: "teammode", mustMatch: /teammode|team-ledger/i },
  { id: "model-config", mustMatch: /lfg-grok-config|model|refresh/i },
]

async function listTestFiles(dir: string, acc: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const ent of entries) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === "skills" || ent.name === "node_modules") continue
      await listTestFiles(full, acc)
    } else if (ent.name.endsWith(".test.ts")) {
      acc.push(full)
    }
  }
  return acc
}

describe("lfg feature coverage inventory (100% feature gate)", () => {
  test("every public feature has at least one matching test file", async () => {
    const tests = await listTestFiles(join(ROOT, "src"))
    const names = tests.map((p) => p.slice(ROOT.length + 1))
    const blob = names.join("\n")
    const missing: string[] = []
    for (const feature of FEATURES) {
      if (!feature.mustMatch.test(blob)) missing.push(feature.id)
    }
    expect(missing, `untested features: ${missing.join(", ")}`).toEqual([])
    expect(names.some((n) => n.includes("ulw-loop"))).toBe(true)
  })

  test("package verify includes skills smoke and ulw-loop tests are in npm test glob", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.verify).toContain("assert-skills-smoke")
    expect(pkg.scripts?.test).toContain("src/cli/**/*.test.ts")
    expect(pkg.scripts?.test).toContain("src/core/**/*.test.ts")
  })

  test("ulw-loop subcommand catalog is fully listed in help text", async () => {
    const help = await readFile(join(ROOT, "src/core/omo/ulw-loop/cli-output.ts"), "utf8")
    for (const sub of [
      "create-goals",
      "status",
      "complete-goals",
      "criteria",
      "record-evidence",
      "checkpoint",
      "steer",
      "add-goal",
      "record-review-blockers",
    ]) {
      expect(help).toContain(sub)
    }
  })
})
