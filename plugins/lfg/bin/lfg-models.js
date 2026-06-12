import { isRecord } from "./lfg-json";
import { aliasGroupKey, loadPublicLiteLLMContextMap } from "./lfg-model-context-catalog";
import { extractContextWindows, extractModelFeatureMetadata } from "./lfg-model-metadata";
export class ModelDiscoveryError extends Error {
    constructor(message) {
        super(message);
        this.name = "ModelDiscoveryError";
    }
}
export function modelDiscoveryPlan() {
    return {
        required: false,
        endpoint: "OpenAI-compatible /v1/models",
        prompt: "OpenAI-compatible base URL (optional — auto from ~/.grok/config.toml or http://127.0.0.1:8317/v1)",
        autoSources: ["--base-url", "LFG_GROK_BASE_URL", "[endpoints].models_base_url", "default_proxy"],
        presets: ["grok", "gpt"],
        defaultPreset: "gpt",
    };
}
export async function fetchModelDiscovery(inputBaseUrl) {
    const { baseUrl, modelsUrl } = normalizeModelUrls(inputBaseUrl);
    const response = await fetch(modelsUrl, { headers: modelRequestHeaders() });
    if (!response.ok) {
        throw new ModelDiscoveryError(`Failed to fetch ${modelsUrl}: HTTP ${response.status}`);
    }
    const payload = await response.json();
    const modelIds = extractModelIds(payload);
    if (modelIds.length === 0) {
        throw new ModelDiscoveryError(`No model ids found in ${modelsUrl}`);
    }
    const localContextWindows = extractContextWindows(payload) ?? {};
    const contextWindows = { ...localContextWindows };
    const modelFeatureMetadata = extractModelFeatureMetadata(payload);
    const modelsMissingContextWindow = modelIds.filter((id) => contextWindows[id] == null);
    // Always attempt to enrich from the public LiteLLM model spec catalog (best-effort, ~4.5s timeout).
    // This pulls max_input_tokens (preferred) or max_tokens for widely known models.
    // Local/proxy-advertised values (from the /v1/models response) always win for the same model id.
    // The goal is to stop everything defaulting to Grok's 200k when the user's OpenAI-compatible proxy
    // does not emit context sizes itself.
    try {
        const publicMap = modelsMissingContextWindow.length === 0 ? {} : await loadPublicLiteLLMContextMap();
        if (publicMap && Object.keys(publicMap).length > 0) {
            for (const id of modelsMissingContextWindow) {
                if (contextWindows[id] != null)
                    continue; // local wins
                const direct = publicMap[id];
                if (typeof direct === "number" && direct > 0) {
                    contextWindows[id] = direct;
                    continue;
                }
                const norm = aliasGroupKey(id);
                const byNorm = publicMap[norm];
                if (typeof byNorm === "number" && byNorm > 0) {
                    contextWindows[id] = byNorm;
                    continue;
                }
                // try stripping provider prefix, e.g. "openai/gpt-5.5" or "anthropic/claude-..."
                const last = id.includes("/") ? id.split("/").pop() : id;
                const norm2 = aliasGroupKey(last);
                const byLast = publicMap[norm2];
                if (typeof byLast === "number" && byLast > 0) {
                    contextWindows[id] = byLast;
                }
            }
        }
    }
    catch {
        // silent; public catalog is only a best-effort enrichment
    }
    const finalContextWindows = Object.keys(contextWindows).length === 0 ? undefined : contextWindows;
    return {
        baseUrl,
        modelsUrl,
        modelIds,
        mapping: mapModels(modelIds),
        contextWindows: finalContextWindows,
        ...(modelFeatureMetadata === undefined ? {} : { modelFeatureMetadata }),
    };
}
export function modelDiscoveryEnv(discovery, agentConfig = null) {
    if (discovery === null) {
        return {};
    }
    const agents = agentConfig ?? defaultLazycodexAgentConfig(discovery);
    const env = {
        LAZYCODEX_OPENAI_BASE_URL: discovery.baseUrl,
        LAZYCODEX_OPENAI_MODELS: discovery.modelIds.join(","),
        LAZYCODEX_MODEL_DEFAULT: discovery.mapping.default,
        LAZYCODEX_MODEL_FAST: discovery.mapping.fast,
        LAZYCODEX_MODEL_REASONING: discovery.mapping.reasoning,
        LAZYCODEX_MODEL_CODING: discovery.mapping.coding,
        LAZYCODEX_MODEL_MAPPING: JSON.stringify(discovery.mapping),
        LAZYCODEX_AGENT_CONFIG: JSON.stringify(agents),
        LAZYCODEX_AGENT_EXPLORER_MODEL: agents.explorer.model,
        LAZYCODEX_AGENT_EXPLORER_REASONING_LEVEL: agents.explorer.reasoningLevel,
        LAZYCODEX_AGENT_REASONING_MODEL: agents.reasoning.model,
        LAZYCODEX_AGENT_REASONING_REASONING_LEVEL: agents.reasoning.reasoningLevel,
        LAZYCODEX_AGENT_CODING_MODEL: agents.coding.model,
        LAZYCODEX_AGENT_CODING_REASONING_LEVEL: agents.coding.reasoningLevel,
    };
    if (discovery.contextWindows && Object.keys(discovery.contextWindows).length > 0) {
        env.LAZYCODEX_CONTEXT_WINDOWS = JSON.stringify(discovery.contextWindows);
    }
    return env;
}
export function defaultLazycodexAgentConfig(discovery) {
    return {
        explorer: { model: discovery.mapping.default, reasoningLevel: "medium" },
        reasoning: { model: discovery.mapping.reasoning, reasoningLevel: "high" },
        coding: { model: discovery.mapping.coding, reasoningLevel: "medium" },
    };
}
export function applyModelPreset(discovery, preset) {
    const mapping = preset === "grok" ? grokCenteredMapping(discovery.modelIds) : gptCenteredMapping(discovery.modelIds);
    // preserve contextWindows across preset application
    return { ...discovery, mapping, preset };
}
function normalizeModelUrls(inputBaseUrl) {
    const trimmed = inputBaseUrl.trim();
    if (trimmed.length === 0) {
        throw new ModelDiscoveryError("OpenAI-compatible base URL is required");
    }
    const base = parseUrl(trimmed);
    base.hash = "";
    base.search = "";
    const path = base.pathname.replace(/\/+$/, "");
    const normalizedPath = path === "" ? "" : path;
    const baseUrl = `${base.origin}${normalizedPath}`;
    const models = new URL(baseUrl);
    if (normalizedPath.endsWith("/models")) {
        return { baseUrl: baseUrl.slice(0, -"/models".length), modelsUrl: models.toString() };
    }
    models.pathname = normalizedPath.endsWith("/v1") ? `${normalizedPath}/models` : `${normalizedPath}/v1/models`;
    return { baseUrl, modelsUrl: models.toString() };
}
function parseUrl(value) {
    try {
        return new URL(value);
    }
    catch (error) {
        if (error instanceof Error) {
            throw new ModelDiscoveryError(`Invalid OpenAI-compatible base URL: ${value}`);
        }
        throw error;
    }
}
function modelRequestHeaders() {
    const apiKey = process.env.OPENAI_API_KEY;
    return typeof apiKey === "string" && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {};
}
function extractModelIds(payload) {
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new ModelDiscoveryError("Model list response must be an object with a data array");
    }
    return payload.data.flatMap((item) => (isRecord(item) && typeof item.id === "string" ? [item.id] : []));
}
function mapModels(modelIds) {
    const first = modelIds[0];
    if (typeof first !== "string") {
        throw new ModelDiscoveryError("Cannot map an empty model list");
    }
    return {
        default: findModel(modelIds, ["grok-3-mini", "grok-build", "grok-3", "grok"]) ?? canonicalModelFor(modelIds, first),
        fast: findModel(modelIds, ["mini", "flash", "small", "fast"]) ?? canonicalModelFor(modelIds, first),
        reasoning: findModel(modelIds, ["grok-4.20-0309-reasoning", "reasoning", "reason", "o1", "o3", "o4", "r1", "grok-4", "gpt-5"]) ?? canonicalModelFor(modelIds, first),
        coding: findModel(modelIds, ["codex-auto-review", "codex", "code", "coder", "gpt", "grok", "claude"]) ?? canonicalModelFor(modelIds, first),
    };
}
function grokCenteredMapping(modelIds) {
    const fallback = mapModels(modelIds);
    return {
        default: findModel(modelIds, ["grok-3-mini-fast", "grok-3-mini", "grok-build", "grok"]) ?? fallback.default,
        fast: findModel(modelIds, ["grok-3-mini-fast", "grok-3-mini", "mini", "fast"]) ?? fallback.fast,
        reasoning: findModel(modelIds, ["grok-4.20-0309-reasoning", "grok-4.3", "grok-4", "reasoning"]) ?? fallback.reasoning,
        coding: findModel(modelIds, ["grok-4.20-0309-non-reasoning", "grok-build", "grok", "codex"]) ?? fallback.coding,
    };
}
function gptCenteredMapping(modelIds) {
    const fallback = mapModels(modelIds);
    return {
        default: findModel(modelIds, ["gpt-5.4-mini", "gpt-5", "gpt"]) ?? fallback.default,
        fast: findModel(modelIds, ["gpt-5.4-mini", "mini", "fast"]) ?? fallback.fast,
        reasoning: findModel(modelIds, ["gpt-5.5", "gpt-5", "reasoning", "o3", "o4"]) ?? fallback.reasoning,
        coding: findModel(modelIds, ["gpt-5.3-codex-spark", "gpt-5.3-codex", "codex", "gpt"]) ?? fallback.coding,
    };
}
function findModel(modelIds, needles) {
    for (const needle of needles) {
        const needleKey = aliasGroupKey(needle);
        const found = modelIds.find((id) => id.toLowerCase() === needle.toLowerCase()) ??
            modelIds.find((id) => aliasGroupKey(id) === needleKey) ??
            modelIds.find((id) => id.toLowerCase().includes(needle));
        if (found) {
            return canonicalModelFor(modelIds, found);
        }
    }
    return null;
}
function canonicalModelFor(modelIds, modelId) {
    const groupKey = aliasGroupKey(modelId);
    const candidates = modelIds.filter((id) => aliasGroupKey(id) === groupKey);
    const exactNormalized = candidates.find((id) => id === groupKey);
    if (exactNormalized) {
        return exactNormalized;
    }
    return candidates.find((id) => id === id.toLowerCase() && !/\s/.test(id)) ?? candidates[0] ?? modelId;
}
