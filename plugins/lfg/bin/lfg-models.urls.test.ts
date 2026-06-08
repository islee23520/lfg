import { describe, expect, test } from "vitest"
import { fetchModelDiscovery } from "./lfg-models"

describe("fetchModelDiscovery URL normalization", () => {
  test("appends /v1/models when base has no models path", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:11434/v1/models")
      return new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200 })
    }
    try {
      const d = await fetchModelDiscovery("http://127.0.0.1:11434")
      expect(d.modelsUrl).toBe("http://127.0.0.1:11434/v1/models")
      expect(d.baseUrl).toBe("http://127.0.0.1:11434")
    } finally {
      globalThis.fetch = original
    }
  })
})