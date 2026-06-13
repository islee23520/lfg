import { mkdtemp, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveModelFallback } from "./model-fallback-resolver"

describe("model-fallback-resolver", () => {
  test("returns primary model when no error condition", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-fallback-noerr-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      join(home, ".grok", "lazycodex-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          explorer: {
            model: "gpt-5.4-mini",
            reasoning_level: "low",
            service_tier: "fast",
            model_fallback: "grok-3-mini-fast",
            model_fallback_reasoning_effort: "low",
            model_fallback_service_tier: "default",
          },
        },
      }),
      "utf8",
    )

    const result = await resolveModelFallback("explorer", { env: { HOME: home } })
    expect(result.primary?.model).toBe("gpt-5.4-mini")
    expect(result.effective?.model).toBe("gpt-5.4-mini")
    expect(result.using_fallback).toBe(false)
    expect(result.fallback_available).toBe(true)
  })

  test("switches to fallback on error condition", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-fallback-err-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      join(home, ".grok", "lazycodex-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          plan: {
            model: "gpt-5.5",
            reasoning_level: "xhigh",
            service_tier: "default",
            model_fallback: "grok-4.20-0309-reasoning",
            model_fallback_reasoning_effort: "xhigh",
            model_fallback_service_tier: "default",
          },
        },
      }),
      "utf8",
    )

    const result = await resolveModelFallback("plan", { env: { HOME: home }, onError: "quota" })
    expect(result.using_fallback).toBe(true)
    expect(result.effective?.model).toBe("grok-4.20-0309-reasoning")
    expect(result.effective?.model_reasoning_effort).toBe("xhigh")
  })

  test("handles missing config file gracefully", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-fallback-missing-"))
    const result = await resolveModelFallback("explorer", { env: { HOME: home } })
    expect(result.primary).toBeNull()
    expect(result.reason).toBe("no-config")
  })

  test("handles agent with no fallback configured", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-fallback-nofb-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      join(home, ".grok", "lazycodex-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: { coding: { model: "gpt-5.5", reasoning_level: "medium" } },
      }),
      "utf8",
    )
    const result = await resolveModelFallback("coding", { env: { HOME: home }, onError: "429" })
    expect(result.fallback_available).toBe(false)
    expect(result.using_fallback).toBe(false)
    expect(result.effective?.model).toBe("gpt-5.5")
  })
})
