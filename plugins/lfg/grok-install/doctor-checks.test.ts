import { describe, expect, test } from "vitest"
import { buildDoctorChecks, doctorChecksJson } from "./doctor-checks"

describe("doctor-checks", () => {
  test("failedRequired lists required failing checks", () => {
    const checks = buildDoctorChecks(
      { ok: false, distEntry: "/x", packageRoot: null, layout: "unknown" },
      false,
    )
    const json = doctorChecksJson(checks)
    expect(json.failedRequired).toEqual(["cli", "grok_install_surface"])
  })

  test("failedRequired empty when cli and install surface ok (#31)", () => {
    const checks = buildDoctorChecks(
      { ok: true, distEntry: "/pkg/dist/lfg.js", packageRoot: "/pkg", layout: "published-workspace" },
      true,
    )
    const json = doctorChecksJson(checks)
    expect(json.failedRequired).toEqual([])
    expect(json.checks).toHaveLength(2)
  })
})