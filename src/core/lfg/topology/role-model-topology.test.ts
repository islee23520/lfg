import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { validateRoleModelTopology } from "./role-model-topology"

describe("role-model-topology validator", () => {
  test("accepts harness SSOT topology json", () => {
    const raw = readFileSync(
      join(process.cwd(), ".omo/evidence/harness/role-model-topology.json"),
      "utf8",
    )
    const result = validateRoleModelTopology(JSON.parse(raw))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.topology.orchestrator.primary_model).toBe("grok-4.5")
      expect(result.topology.orchestrator.effort).toBe("high")
      expect(result.topology.deep_oracle.primary_family).toBe("gpt")
      expect(result.topology.vision.primary_family).toBe("gemini")
    }
  })

  test("rejects missing orchestrator", () => {
    const result = validateRoleModelTopology({ version: 1, deep_oracle: {}, vision: {}, degrade: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/orchestrator/)
    }
  })

  test("rejects non-grok orchestrator family", () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), ".omo/evidence/harness/role-model-topology.json"), "utf8"),
    )
    raw.orchestrator.primary_family = "gpt"
    const result = validateRoleModelTopology(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/orchestrator.primary_family must be grok/)
    }
  })

  test("rejects degrade without gpt/gemini/grok rows", () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), ".omo/evidence/harness/role-model-topology.json"), "utf8"),
    )
    raw.degrade = [{ missing: "gpt", behavior: "x" }]
    const result = validateRoleModelTopology(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/gemini|grok/)
    }
  })
})
