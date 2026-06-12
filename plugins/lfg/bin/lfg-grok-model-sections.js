import { aliasGroupKey } from "./lfg-model-context-catalog";
export function upsertModelSections(source, discovery, baseUrl, apiKey, priorConfig) {
    const aliases = modelAliases(discovery);
    let next = source;
    for (const alias of aliases) {
        const upstreamModelId = alias === "grok-build" ? discovery.mapping.default : canonicalModelForAlias(discovery.modelIds, alias);
        const lines = [`model = ${tomlString(upstreamModelId)}`, `base_url = ${tomlString(baseUrl)}`];
        if (typeof apiKey === "string" && apiKey.length > 0) {
            lines.push(`api_key = ${tomlString(apiKey)}`);
        }
        const contextWindow = resolveContextWindowForModel(discovery, upstreamModelId, priorConfig, alias);
        if (contextWindow !== null) {
            lines.push(`context_window = ${contextWindow}`);
        }
        const metadata = resolveFeatureMetadataForModel(discovery, upstreamModelId, alias);
        if (metadata?.usable !== undefined) {
            lines.push(`usable = ${metadata.usable ? "true" : "false"}`);
        }
        if (metadata?.features !== undefined && metadata.features.length > 0) {
            lines.push(`features = ${tomlStringArray(metadata.features)}`);
        }
        next = upsertSection(next, modelSectionName(alias), lines);
    }
    return next;
}
function resolveContextWindowForModel(discovery, upstreamModelId, priorConfig, alias) {
    const contextWindows = discovery.contextWindows;
    if (contextWindows !== undefined) {
        // T1 canonical lookup: normalize via aliasGroupKey so discovery for "gpt-5.5"
        // populates both canonical section and display-alias sections (e.g. "GPT-5.5")
        const normalized = aliasGroupKey(upstreamModelId);
        const exact = contextWindows[upstreamModelId] ?? contextWindows[normalized];
        if (typeof exact === "number" && exact > 0)
            return exact;
        const byAlias = contextWindows[alias] ?? contextWindows[aliasGroupKey(alias)];
        if (typeof byAlias === "number" && byAlias > 0)
            return byAlias;
    }
    return readPriorContextWindow(priorConfig, alias);
}
function resolveFeatureMetadataForModel(discovery, upstreamModelId, alias) {
    const metadata = discovery.modelFeatureMetadata;
    if (metadata === undefined)
        return null;
    // T1: canonical metadata from discovery applies to display aliases (via normalized key)
    const normalized = aliasGroupKey(upstreamModelId);
    return metadata[upstreamModelId] ?? metadata[normalized] ?? metadata[alias] ?? metadata[aliasGroupKey(alias)] ?? null;
}
function readPriorContextWindow(source, alias) {
    const sectionName = modelSectionName(alias);
    const header = `[${sectionName}]`;
    const start = source.indexOf(header);
    if (start === -1)
        return null;
    const rest = source.slice(start + header.length);
    const next = /\n\[[^\n]+\]/.exec(rest);
    const body = next?.index === undefined ? rest : rest.slice(0, next.index);
    const match = /^\s*context_window\s*=\s*(.+)$/m.exec(body);
    if (!match?.[1])
        return null;
    const raw = match[1].trim();
    const parsed = raw.startsWith('"') || raw.startsWith("'") ? Number(raw.slice(1, -1)) : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}
function modelAliases(discovery) {
    return [...new Set(["grok-build", ...discovery.modelIds])];
}
function canonicalModelForAlias(modelIds, alias) {
    const aliasKey = aliasGroupKey(alias);
    const candidates = modelIds.filter((modelId) => aliasGroupKey(modelId) === aliasKey);
    const exactNormalized = candidates.find((modelId) => modelId === aliasKey);
    if (exactNormalized) {
        return exactNormalized;
    }
    const lowercase = candidates.find((modelId) => modelId === modelId.toLowerCase() && !/\s/.test(modelId));
    return lowercase ?? candidates[0] ?? alias;
}
function upsertSection(source, section, lines) {
    const block = `[${section}]\n${lines.join("\n")}\n`;
    const sectionRegex = makeSectionRegex(section);
    if (sectionRegex.test(source)) {
        let replaced = false;
        return source.replace(makeSectionRegex(section, "g"), (match) => {
            const prefix = match.startsWith("\n") ? "\n" : "";
            if (replaced)
                return prefix;
            replaced = true;
            return `${prefix}${block}`;
        });
    }
    const trimmed = source.trimEnd();
    return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`;
}
function makeSectionRegex(section, flags = "") {
    const parts = parseKeyPath(section);
    const partPatterns = parts.map(makeKeyPattern);
    return new RegExp(`(^|\\n)\\[\\s*${partPatterns.join("\\s*\\.\\s*")}\\s*\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`, flags);
}
function parseKeyPath(section) {
    const parts = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < section.length; i++) {
        const char = section[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        }
        else if (char === "." && !inQuotes) {
            parts.push(current);
            current = "";
        }
        else {
            current += char;
        }
    }
    if (current.length > 0 || parts.length === 0)
        parts.push(current);
    return parts;
}
function makeKeyPattern(part) {
    const escaped = escapeRegExp(part);
    if (/^[A-Za-z0-9_-]+$/.test(part)) {
        return `(?:"${escaped}"|'${escaped}'|${escaped})`;
    }
    return `(?:"${escaped}"|'${escaped}')`;
}
function tomlString(value) {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
function tomlStringArray(values) {
    return `[${values.map(tomlString).join(", ")}]`;
}
function modelSectionName(modelId) {
    return `model.${tomlString(modelId)}`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
