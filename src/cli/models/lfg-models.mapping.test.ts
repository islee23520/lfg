import { describe, expect, test } from "vitest"
import { applyModelPreset, fetchModelDiscovery } from "./lfg-models"

describe("model mapping catalog", () => {
  test("mapModels picks reasoning role from a Grok reasoning id", async () => {
    const discovery = await fetchModelDiscoveryFromPayload(["grok-3-mini-fast", "grok-4.20-0309-reasoning"])
    expect(discovery.mapping.default).toBe("grok-4.20-0309-reasoning")
    expect(discovery.mapping.fast).toBe("grok-3-mini-fast")
    expect(discovery.mapping.reasoning).toBe("grok-4.20-0309-reasoning")
    expect(discovery.modelIds).toEqual(["grok-3-mini-fast", "grok-4.20-0309-reasoning"])
  })

  test("normalizes control characters from external model ids", async () => {
    const discovery = await fetchModelDiscoveryFromPayload(["grok-3-mini-fast\npermission_mode: default\n# injected"])
    expect(discovery.modelIds).toEqual(["grok-3-mini-fast\\npermission_mode: default\\n# injected"])
    expect(discovery.mapping.fast).toBe("grok-3-mini-fast\\npermission_mode: default\\n# injected")
  })

  test("grok preset keeps Grok-specialized routing", async () => {
    const discovery = await fetchModelDiscoveryFromPayload([
      "grok-3-mini-fast",
      "grok-4.5",
      "grok-4.20-0309-non-reasoning",
      "grok-4.20-0309-reasoning",
    ])

    expect(applyModelPreset(discovery, "grok").mapping).toMatchObject({
      default: "grok-4.5",
      fast: "grok-3-mini-fast",
      reasoning: "grok-4.5",
    })
  })
})

describe("context window extraction from /v1/models", () => {
  test("captures context_window when present on items", async () => {
    const d = await fetchModelDiscoveryFromPayloadWithMeta([
      { id: "grok-4.5", context_window: 500000 },
      { id: "grok-3-mini-fast", context_window: 128000 },
    ])
    expect(d.contextWindows).toEqual({ "grok-4.5": 500000, "grok-3-mini-fast": 128000 })
  })

  test("falls back to max_model_len and other variants", async () => {
    const d = await fetchModelDiscoveryFromPayloadWithMeta([
      { id: "grok-4.5", max_model_len: 131072 },
      { id: "grok-3-mini-fast", maxModelLen: 65536 },
    ])
    expect(d.contextWindows?.["grok-4.5"]).toBe(131072)
    expect(d.contextWindows?.["grok-3-mini-fast"]).toBe(65536)
  })

  test("is undefined when upstream provides no context info", async () => {
    const d = await fetchModelDiscoveryFromPayload(["grok-4.5", "grok-3-mini-fast"])
    expect(d.contextWindows).toBeUndefined()
  })
})

describe("reasoning effort extraction from /v1/models", () => {
  test("captures advertised reasoning effort metadata when present", async () => {
    const d = await fetchModelDiscoveryFromPayloadWithMeta([
      { id: "grok-4.5", reasoning_effort: "xhigh" },
      { id: "grok-3-mini-fast", info: { default_reasoning_effort: "low" } },
    ])

    expect(d.modelFeatureMetadata?.["grok-4.5"]?.reasoningEffort).toBe("xhigh")
    expect(d.modelFeatureMetadata?.["grok-3-mini-fast"]?.reasoningEffort).toBe("low")
  })
})

describe("public LiteLLM model spec enrichment (when local /v1/models omits context)", () => {
  test("enriches from public catalog using max_input_tokens when local payload has no sizes", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: any) => {
      const url = String(input)
      if (url.includes("/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "grok-4.5" }, { id: "grok-3-mini-fast" }] }), { status: 200 })
      }
      if (url.includes("litellm/main/model_prices_and_context_window.json")) {
        return new Response(JSON.stringify({
          "grok-4.5": { max_input_tokens: 500000 },
          "grok-3-mini-fast": { max_input_tokens: 128000 },
        }), { status: 200 })
      }
      return originalFetch(input as any)
    }
    try {
      const d = await fetchModelDiscovery("http://127.0.0.1:11434/v1")
      expect(d.contextWindows?.["grok-4.5"]).toBe(500000)
      expect(d.contextWindows?.["grok-3-mini-fast"]).toBe(128000)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("local /v1/models values win over public catalog", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: any) => {
      const url = String(input)
      if (url.includes("/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "grok-4.5", context_window: 123456 }] }), { status: 200 })
      }
      if (url.includes("litellm")) {
        return new Response(JSON.stringify({ "grok-4.5": { max_input_tokens: 999999 } }), { status: 200 })
      }
      return originalFetch(input as any)
    }
    try {
      const d = await fetchModelDiscovery("http://127.0.0.1:11434/v1")
      // local value must win
      expect(d.contextWindows?.["grok-4.5"]).toBe(123456)
    } finally {
      globalThis.fetch = originalFetch
    }
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

async function fetchModelDiscoveryFromPayloadWithMeta(items: readonly { id: string; [k: string]: unknown }[]): Promise<Awaited<ReturnType<typeof fetchModelDiscovery>>> {
  const original = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: items }), { status: 200 })
  try {
    return await fetchModelDiscovery("http://127.0.0.1:11434/v1")
  } finally {
    globalThis.fetch = original
  }
}
