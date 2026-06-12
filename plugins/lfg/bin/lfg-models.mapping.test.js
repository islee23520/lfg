import { describe, expect, test } from "vitest";
import { applyModelPreset, fetchModelDiscovery } from "./lfg-models";
describe("model mapping catalog", () => {
    test("mapModels picks reasoning role from o3-mini id", async () => {
        const discovery = await fetchModelDiscoveryFromPayload(["gpt-4.1-mini", "o3-mini"]);
        expect(discovery.mapping.default).toBe("gpt-4.1-mini");
        expect(discovery.mapping.reasoning).toBe("o3-mini");
        expect(discovery.modelIds).toEqual(["gpt-4.1-mini", "o3-mini"]);
    });
    test("presets switch model mapping between grok-centered and gpt-centered", async () => {
        const discovery = await fetchModelDiscoveryFromPayload([
            "grok-3-mini-fast",
            "grok-4.20-0309-reasoning",
            "gpt-5.4-mini",
            "gpt-5.5",
            "gpt-5.3-codex-spark",
        ]);
        expect(applyModelPreset(discovery, "grok").mapping).toMatchObject({
            default: "grok-3-mini-fast",
            reasoning: "grok-4.20-0309-reasoning",
        });
        expect(applyModelPreset(discovery, "gpt").mapping).toMatchObject({
            default: "gpt-5.4-mini",
            reasoning: "gpt-5.5",
            coding: "gpt-5.3-codex-spark",
        });
    });
});
describe("context window extraction from /v1/models", () => {
    test("captures context_window when present on items", async () => {
        const d = await fetchModelDiscoveryFromPayloadWithMeta([
            { id: "gpt-4.1-mini", context_window: 128000 },
            { id: "o3-mini", context_window: 200000 },
        ]);
        expect(d.contextWindows).toEqual({ "gpt-4.1-mini": 128000, "o3-mini": 200000 });
    });
    test("falls back to max_model_len and other variants", async () => {
        const d = await fetchModelDiscoveryFromPayloadWithMeta([
            { id: "vllm-model", max_model_len: 131072 },
            { id: "other", maxModelLen: 65536 },
        ]);
        expect(d.contextWindows?.["vllm-model"]).toBe(131072);
        expect(d.contextWindows?.["other"]).toBe(65536);
    });
    test("is undefined when upstream provides no context info", async () => {
        const d = await fetchModelDiscoveryFromPayload(["plain-1", "plain-2"]);
        expect(d.contextWindows).toBeUndefined();
    });
});
describe("public LiteLLM model spec enrichment (when local /v1/models omits context)", () => {
    test("enriches from public catalog using max_input_tokens when local payload has no sizes", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input) => {
            const url = String(input);
            if (url.includes("/v1/models")) {
                return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "claude-sonnet-4-6" }] }), { status: 200 });
            }
            if (url.includes("litellm/main/model_prices_and_context_window.json")) {
                return new Response(JSON.stringify({
                    "gpt-5.5": { max_input_tokens: 400000 },
                    "claude-sonnet-4-6": { max_input_tokens: 200000 },
                }), { status: 200 });
            }
            return originalFetch(input);
        };
        try {
            const d = await fetchModelDiscovery("http://127.0.0.1:11434/v1");
            expect(d.contextWindows?.["gpt-5.5"]).toBe(400000);
            expect(d.contextWindows?.["claude-sonnet-4-6"]).toBe(200000);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    test("local /v1/models values win over public catalog", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input) => {
            const url = String(input);
            if (url.includes("/v1/models")) {
                return new Response(JSON.stringify({ data: [{ id: "gpt-5.5", context_window: 123456 }] }), { status: 200 });
            }
            if (url.includes("litellm")) {
                return new Response(JSON.stringify({ "gpt-5.5": { max_input_tokens: 999999 } }), { status: 200 });
            }
            return originalFetch(input);
        };
        try {
            const d = await fetchModelDiscovery("http://127.0.0.1:11434/v1");
            // local value must win
            expect(d.contextWindows?.["gpt-5.5"]).toBe(123456);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
});
async function fetchModelDiscoveryFromPayload(modelIds) {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: modelIds.map((id) => ({ id })) }), { status: 200 });
    try {
        return await fetchModelDiscovery("http://127.0.0.1:11434/v1");
    }
    finally {
        globalThis.fetch = original;
    }
}
async function fetchModelDiscoveryFromPayloadWithMeta(items) {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: items }), { status: 200 });
    try {
        return await fetchModelDiscovery("http://127.0.0.1:11434/v1");
    }
    finally {
        globalThis.fetch = original;
    }
}
