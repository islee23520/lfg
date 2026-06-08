import { describe, expect, test } from "vitest"
import { fetchModelDiscovery } from "./lfg-models"

describe("model mapping catalog", () => {
  test("mapModels picks reasoning role from o3-mini id", async () => {
    const discovery = await fetchModelDiscoveryFromPayload(["gpt-4.1-mini", "o3-mini"])
    expect(discovery.mapping.default).toBe("gpt-4.1-mini")
    expect(discovery.mapping.reasoning).toBe("o3-mini")
    expect(discovery.modelIds).toEqual(["gpt-4.1-mini", "o3-mini"])
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