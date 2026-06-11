import { describe, expect, test } from "vitest"
import { applyModelPreset, fetchModelDiscovery } from "./lfg-models"

describe("model mapping catalog", () => {
  test("mapModels picks reasoning role from o3-mini id", async () => {
    const discovery = await fetchModelDiscoveryFromPayload(["gpt-4.1-mini", "o3-mini"])
    expect(discovery.mapping.default).toBe("gpt-4.1-mini")
    expect(discovery.mapping.reasoning).toBe("o3-mini")
    expect(discovery.modelIds).toEqual(["gpt-4.1-mini", "o3-mini"])
  })

  test("presets switch model mapping between grok-centered and gpt-centered", async () => {
    const discovery = await fetchModelDiscoveryFromPayload([
      "grok-3-mini-fast",
      "grok-4.20-0309-reasoning",
      "gpt-5.4-mini",
      "gpt-5.5",
      "gpt-5.3-codex-spark",
    ])

    expect(applyModelPreset(discovery, "grok").mapping).toMatchObject({
      default: "grok-3-mini-fast",
      reasoning: "grok-4.20-0309-reasoning",
    })
    expect(applyModelPreset(discovery, "gpt").mapping).toMatchObject({
      default: "gpt-5.4-mini",
      reasoning: "gpt-5.5",
      coding: "gpt-5.3-codex-spark",
    })
  })
})

async function fetchModelDiscoveryFromPayload(modelIds: readonly string[]): Promise<Awaited<ReturnType<typeof fetchModelDiscovery>>> {
  const original = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: modelIds.map((id) => ({ id })) }), { status: 200 })
  try {
    return await fetchModelDiscovery("http://127.0.0.1:11434/v1")
  } finally {
    globalThis.fetch = original
  }
}
