import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { validateRoleModelTopology } from "./role-model-topology"

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8"))
}

describe("role-model topology vs overrides", () => {
  test("topology SSOT validates and pins families", () => {
    const topology = loadJson(".omo/evidence/harness/role-model-topology.json")
    const result = validateRoleModelTopology(topology)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.topology.orchestrator.primary_model).toBe("grok-4.5")
    expect(result.topology.deep_oracle.primary_family).toBe("gpt")
    expect(result.topology.vision.primary_family).toBe("gemini")
  })

  test("bundled overrides prefer GPT for oracle and Gemini for vision roles", () => {
    const overrides = loadJson("src/grok/flavour/omo-agent-overrides.json") as {
      overrides: Record<string, { model?: string; model_fallback?: string }>
    }
    expect(overrides.overrides.oracle?.model ?? "").toMatch(/^gpt-/)
    expect(overrides.overrides["visual-engineering"]?.model ?? "").toMatch(/gemini/i)
    expect(overrides.overrides["multimodal-looker"]?.model ?? "").toMatch(/gemini/i)
  })

  test("missing GPT/Gemini degrade behaviors are documented in topology", () => {
    const topology = loadJson(".omo/evidence/harness/role-model-topology.json") as {
      degrade: Array<{ missing: string; behavior: string }>
    }
    const byMissing = Object.fromEntries(topology.degrade.map((row) => [row.missing, row.behavior]))
    expect(byMissing.gpt.toLowerCase()).toMatch(/grok|second-opinion|residual/)
    expect(byMissing.gemini.toLowerCase()).toMatch(/fail-soft|degrade|gpt|vision/)
    expect(byMissing.grok.toLowerCase()).toMatch(/fail closed|fail-closed|closed/)
  })
})
