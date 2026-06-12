import { isRecord } from "./lfg-json";
export function extractContextWindows(payload) {
    if (!isRecord(payload) || !Array.isArray(payload.data))
        return undefined;
    const out = {};
    for (const item of payload.data) {
        if (!isRecord(item) || typeof item.id !== "string")
            continue;
        const contextWindow = pickContextWindow(item);
        if (contextWindow !== null)
            out[item.id] = contextWindow;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
export function extractModelFeatureMetadata(payload) {
    if (!isRecord(payload) || !Array.isArray(payload.data))
        return undefined;
    const out = {};
    for (const item of payload.data) {
        if (!isRecord(item) || typeof item.id !== "string")
            continue;
        const metadata = pickModelFeatureMetadata(item);
        if (metadata !== null)
            out[item.id] = metadata;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
export function toPositiveInt(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
        return Math.floor(value);
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0)
            return Math.floor(parsed);
    }
    return null;
}
function pickContextWindow(item) {
    const candidates = [
        "context_window",
        "contextWindow",
        "context_window_size",
        "contextWindowSize",
        "max_model_len",
        "maxModelLen",
        "max_model_length",
        "maxModelLength",
        "max_input_tokens",
        "maxInputTokens",
        "max_tokens",
        "maxTokens",
        "n_ctx",
        "nCtx",
    ];
    for (const key of candidates) {
        const parsed = toPositiveInt(item[key]);
        if (parsed !== null)
            return parsed;
    }
    const nested = isRecord(item.info) ? item.info : isRecord(item.limits) ? item.limits : null;
    if (nested !== null) {
        for (const key of candidates) {
            const parsed = toPositiveInt(nested[key]);
            if (parsed !== null)
                return parsed;
        }
    }
    return null;
}
function pickModelFeatureMetadata(item) {
    const usable = pickBoolean(item, ["usable", "available", "enabled"]);
    const features = pickFeatureList(item);
    if (usable === undefined && features.length === 0)
        return null;
    return {
        ...(usable === undefined ? {} : { usable }),
        ...(features.length === 0 ? {} : { features }),
    };
}
function pickBoolean(item, keys) {
    for (const key of keys) {
        const direct = parseBoolean(item[key]);
        if (direct !== undefined)
            return direct;
    }
    const nested = isRecord(item.info) ? item.info : isRecord(item.metadata) ? item.metadata : null;
    if (nested === null)
        return undefined;
    for (const key of keys) {
        const parsed = parseBoolean(nested[key]);
        if (parsed !== undefined)
            return parsed;
    }
    return undefined;
}
function parseBoolean(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true")
        return true;
    if (normalized === "false")
        return false;
    return undefined;
}
function pickFeatureList(item) {
    const sources = [
        item.features,
        item.feature_flags,
        item.capabilities,
        item.supported_features,
        isRecord(item.info) ? item.info.features : undefined,
        isRecord(item.metadata) ? item.metadata.features : undefined,
    ];
    const features = new Set();
    for (const source of sources) {
        for (const feature of parseFeatureSource(source)) {
            features.add(feature);
        }
    }
    return [...features].sort();
}
function parseFeatureSource(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    }
    if (isRecord(value)) {
        return Object.entries(value)
            .filter((entry) => entry[1] === true)
            .map(([key]) => key)
            .filter((key) => key.trim().length > 0);
    }
    if (typeof value === "string" && value.trim().length > 0) {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }
    return [];
}
