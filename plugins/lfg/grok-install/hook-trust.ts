export type GrokHooksFile = {
  readonly hooks: readonly { readonly name: string; readonly description?: string }[]
}

export type HookTrustResult = {
  readonly ok: boolean
  readonly hookNames: readonly string[]
  readonly error: string | null
}

/** Validate Grok plugin hooks.json shape (trust surface for install/doctor). */
export function validateGrokHooksJson(raw: unknown): HookTrustResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, hookNames: [], error: "hooks.json must be an object" }
  }
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.hooks)) {
    return { ok: false, hookNames: [], error: "hooks.json missing hooks array" }
  }
  const hookNames: string[] = []
  for (const entry of record.hooks) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, hookNames: [], error: "hook entry must be an object" }
    }
    const name = (entry as Record<string, unknown>).name
    if (typeof name !== "string" || name.length === 0) {
      return { ok: false, hookNames: [], error: "hook name must be a non-empty string" }
    }
    hookNames.push(name)
  }
  return { ok: true, hookNames, error: null }
}