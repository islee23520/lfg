import { describe, expect, test } from "vitest"
import { fetchMultiProviderDiscovery, ModelDiscoveryError, type ProviderSource } from "./lfg-models"

describe("fetchMultiProviderDiscovery (OpenGrok multi-endpoint)", () => {
  test("merges models from each provider and keeps per-provider base_url + credentials", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: any) => {
      const url = String(input)
      if (url.startsWith("https://api.xai-1.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "grok-4.5" }, { id: "grok-3-mini-fast" }] }), { status: 200 })
      }
      if (url.startsWith("https://api.xai-2.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "grok-4.20-0309-reasoning" }] }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }
    try {
      const providers: ProviderSource[] = [
        { id: "xai-primary", baseUrl: "https://api.xai-1.com/v1", envKey: "XAI_API_KEY" },
        { id: "xai-secondary", baseUrl: "https://api.xai-2.com/v1", apiKey: "sk-xai-test" },
      ]
      const discovery = await fetchMultiProviderDiscovery(providers)

      expect(discovery.modelIds).toEqual(expect.arrayContaining(["grok-4.5", "grok-3-mini-fast", "grok-4.20-0309-reasoning"]))
      expect(discovery.modelIds).toHaveLength(3)

      const primary = discovery.providerEndpoints?.find((endpoint) => endpoint.id === "xai-primary")
      expect(primary?.baseUrl).toBe("https://api.xai-1.com/v1")
      expect(primary?.envKey).toBe("XAI_API_KEY")
      expect(primary?.modelIds).toEqual(["grok-4.5", "grok-3-mini-fast"])

      const secondary = discovery.providerEndpoints?.find((endpoint) => endpoint.id === "xai-secondary")
      expect(secondary?.baseUrl).toBe("https://api.xai-2.com/v1")
      expect(secondary?.apiKey).toBe("sk-xai-test")
      expect(secondary?.modelIds).toEqual(["grok-4.20-0309-reasoning"])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("skips a provider that fails /v1/models instead of aborting the merge", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: any) => {
      const url = String(input)
      if (url.startsWith("https://api.xai.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "grok-4.5" }] }), { status: 200 })
      }
      return new Response("down", { status: 500 })
    }
    try {
      const providers: ProviderSource[] = [
        { id: "xai", baseUrl: "https://api.xai.com/v1" },
        { id: "dead", baseUrl: "https://dead.example.com/v1" },
      ]
      const discovery = await fetchMultiProviderDiscovery(providers)
      expect(discovery.modelIds).toEqual(["grok-4.5"])
      expect(discovery.providerEndpoints?.map((endpoint) => endpoint.id)).toEqual(["xai"])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("throws when no providers respond", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("down", { status: 500 })
    try {
      await expect(
        fetchMultiProviderDiscovery([{ id: "dead", baseUrl: "https://dead.example.com/v1" }]),
      ).rejects.toBeInstanceOf(ModelDiscoveryError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

})
