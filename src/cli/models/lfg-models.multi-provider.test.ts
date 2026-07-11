import { describe, expect, test } from "vitest"
import { fetchMultiProviderDiscovery, ModelDiscoveryError, type ProviderSource } from "./lfg-models"

describe("fetchMultiProviderDiscovery (OpenGrok multi-endpoint)", () => {
  test("merges models from each provider and keeps per-provider base_url + credentials", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: any) => {
      const url = String(input)
      if (url.startsWith("https://api.openai.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.5-mini" }] }), { status: 200 })
      }
      if (url.startsWith("https://api.anthropic.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "claude-opus-4-7" }] }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }
    try {
      const providers: ProviderSource[] = [
        { id: "openai", baseUrl: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY" },
        { id: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant-test" },
      ]
      const discovery = await fetchMultiProviderDiscovery(providers)

      expect(discovery.modelIds).toEqual(expect.arrayContaining(["gpt-5.5", "gpt-5.5-mini", "claude-opus-4-7"]))
      expect(discovery.modelIds).toHaveLength(3)

      const openai = discovery.providerEndpoints?.find((endpoint) => endpoint.id === "openai")
      expect(openai?.baseUrl).toBe("https://api.openai.com/v1")
      expect(openai?.envKey).toBe("OPENAI_API_KEY")
      expect(openai?.modelIds).toEqual(["gpt-5.5", "gpt-5.5-mini"])

      const anthropic = discovery.providerEndpoints?.find((endpoint) => endpoint.id === "anthropic")
      expect(anthropic?.baseUrl).toBe("https://api.anthropic.com/v1")
      expect(anthropic?.apiKey).toBe("sk-ant-test")
      expect(anthropic?.modelIds).toEqual(["claude-opus-4-7"])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("skips a provider that fails /v1/models instead of aborting the merge", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: any) => {
      const url = String(input)
      if (url.startsWith("https://api.openai.com/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), { status: 200 })
      }
      return new Response("down", { status: 500 })
    }
    try {
      const providers: ProviderSource[] = [
        { id: "openai", baseUrl: "https://api.openai.com/v1" },
        { id: "dead", baseUrl: "https://dead.example.com/v1" },
      ]
      const discovery = await fetchMultiProviderDiscovery(providers)
      expect(discovery.modelIds).toEqual(["gpt-5.5"])
      expect(discovery.providerEndpoints?.map((endpoint) => endpoint.id)).toEqual(["openai"])
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
