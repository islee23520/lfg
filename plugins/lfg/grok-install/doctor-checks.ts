import type { JsonObject } from "../bin/lfg-json"
import type { LfgCliLayout } from "../bin/lfg-package-layout"

export type DoctorCheck = {
  readonly name: string
  readonly ok: boolean
  readonly required: boolean
}

export function buildDoctorChecks(cli: LfgCliLayout, installSurfaceOk: boolean): readonly DoctorCheck[] {
  return [
    { name: "cli", ok: cli.ok, required: true },
    { name: "grok_install_surface", ok: installSurfaceOk, required: true },
  ]
}

export function doctorChecksJson(checks: readonly DoctorCheck[]): JsonObject {
  const failedRequired = checks.filter((c) => c.required && !c.ok).map((c) => c.name)
  return {
    checks: checks.map((c) => ({ name: c.name, ok: c.ok, required: c.required })),
    failedRequired,
  }
}