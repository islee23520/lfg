import { describe, expect, test } from "vitest"
import { ENGINE_PROFILES, ENGINES, normalizeEngine } from "./engines"
import { defaultEngineForRole, OMO_WORKER_ROLES } from "./omo-roles"

describe("Codex-only external engine", () => {
  test("exposes only GPT through the codex binary", () => {
    expect(ENGINES).toEqual(["gpt"])
    expect(ENGINE_PROFILES.gpt.binary).toBe("codex")
  })
  test("aliases retired engines and routes every worker role to GPT", () => {
    for (const alias of ["claude", "agy", "gemini", "gpt"]) expect(normalizeEngine(alias)).toBe("gpt")
    for (const role of OMO_WORKER_ROLES) expect(defaultEngineForRole(role)).toBe("gpt")
  })
})
