import { describe, expect, test } from "vitest"
import { BACKEND_ROUTE_AGENT_NAMES, BACKEND_ROUTE_CATEGORY_NAMES, CLI_BACKENDS, defaultBackendRoutingConfig, normalizeCliBackend, resolveBackendRoute } from "./backend-routing"

describe("Codex-only backend routing", () => {
  test("keeps only sisyphus in agent routing", () => {
    const config = defaultBackendRoutingConfig()
    expect(CLI_BACKENDS).toEqual(["grok", "codex"])
    expect(BACKEND_ROUTE_AGENT_NAMES).toEqual(["sisyphus"])
    expect(BACKEND_ROUTE_CATEGORY_NAMES).toEqual([])
    expect(config.agents).toEqual({ sisyphus: "grok" })
  })

  test("resolves a slim agent override before the global backend", () => {
    const config = defaultBackendRoutingConfig()

    expect(resolveBackendRoute(config, { agent: "lazycodex" })).toMatchObject({ backend: "grok", source: "global" })
    expect(resolveBackendRoute(config, { agent: "oracle" })).toMatchObject({ backend: "grok", source: "global" })
  })

  test("normalizes retired engines to the Codex CLI command", () => {
    expect(normalizeCliBackend("gpt")).toBe("codex")
    expect(normalizeCliBackend("claude")).toBe("codex")
    expect(normalizeCliBackend("agy")).toBe("codex")
    expect(normalizeCliBackend("gemini")).toBe("codex")
  })
})
