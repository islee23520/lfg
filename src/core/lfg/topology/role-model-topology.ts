export type TopologyLane = {
  readonly roles: readonly string[]
  readonly primary_family: string
  readonly primary_model: string
  readonly effort?: string
  readonly fallback?: readonly string[]
  readonly later?: readonly string[]
}

export type TopologyDegrade = {
  readonly missing: string
  readonly behavior: string
}

export type RoleModelTopology = {
  readonly version: number
  readonly orchestrator: TopologyLane
  readonly deep_oracle: TopologyLane
  readonly vision: TopologyLane
  readonly coding?: TopologyLane
  readonly degrade: readonly TopologyDegrade[]
}

export type TopologyValidation =
  | { readonly ok: true; readonly topology: RoleModelTopology }
  | { readonly ok: false; readonly errors: readonly string[] }

const REQUIRED_LANES = ["orchestrator", "deep_oracle", "vision"] as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateLane(name: string, value: unknown, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`${name} must be an object`)
    return
  }
  if (!Array.isArray(value.roles) || value.roles.length === 0 || !value.roles.every((r) => typeof r === "string")) {
    errors.push(`${name}.roles must be a non-empty string array`)
  }
  for (const key of ["primary_family", "primary_model"] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      errors.push(`${name}.${key} must be a non-empty string`)
    }
  }
}

export function validateRoleModelTopology(input: unknown): TopologyValidation {
  const errors: string[] = []
  if (!isObject(input)) {
    return { ok: false, errors: ["topology must be an object"] }
  }
  if (input.version !== 1) {
    errors.push("version must be 1")
  }
  for (const lane of REQUIRED_LANES) {
    validateLane(lane, input[lane], errors)
  }
  if (input.coding !== undefined) {
    validateLane("coding", input.coding, errors)
  }
  if (!Array.isArray(input.degrade) || input.degrade.length === 0) {
    errors.push("degrade must be a non-empty array")
  } else {
    for (const [i, row] of input.degrade.entries()) {
      if (!isObject(row) || typeof row.missing !== "string" || typeof row.behavior !== "string") {
        errors.push(`degrade[${i}] must have string missing and behavior`)
      }
    }
    const missing = new Set(
      input.degrade.filter(isObject).map((row) => String(row.missing)),
    )
    for (const required of ["gpt", "gemini", "grok"]) {
      if (!missing.has(required)) errors.push(`degrade must include missing=${required}`)
    }
  }

  // Policy pins for Grok-centric harness
  if (isObject(input.orchestrator)) {
    if (input.orchestrator.primary_family !== "grok") {
      errors.push("orchestrator.primary_family must be grok")
    }
    if (input.orchestrator.primary_model !== "grok-4.5") {
      errors.push("orchestrator.primary_model must be grok-4.5")
    }
    if (input.orchestrator.effort !== "high") {
      errors.push("orchestrator.effort must be high")
    }
    const roles = Array.isArray(input.orchestrator.roles) ? input.orchestrator.roles : []
    if (!roles.includes("sisyphus") || !roles.includes("default")) {
      errors.push("orchestrator.roles must include default and sisyphus")
    }
  }
  if (isObject(input.deep_oracle) && input.deep_oracle.primary_family !== "gpt") {
    errors.push("deep_oracle.primary_family must be gpt")
  }
  if (isObject(input.vision) && input.vision.primary_family !== "gemini") {
    errors.push("vision.primary_family must be gemini")
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, topology: input as unknown as RoleModelTopology }
}
