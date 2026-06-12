import { readFile } from "node:fs/promises";
import { join } from "node:path";
const AGENT_NAMES = ["explorer", "reasoning", "coding"];
const REASONING_LEVELS = ["low", "medium", "high", "xhigh"];
/** Read `[lazycodex.agents.*]` from ~/.grok/config.toml when present. */
export async function readLazycodexAgentsFromGrokConfig(home) {
    const path = join(home, ".grok", "config.toml");
    let text;
    try {
        text = await readFile(path, "utf8");
    }
    catch {
        return null;
    }
    const models = readLazycodexModelsSection(text);
    const partial = {};
    for (const name of AGENT_NAMES) {
        const section = readTomlSection(text, `lazycodex.agents.${name}`);
        const model = parseTomlString(section.model);
        const reasoningLevel = parseReasoningLevel(section.reasoning_level);
        if (model !== null) {
            partial[name] = {
                model,
                reasoningLevel: reasoningLevel ?? defaultReasoningForAgent(name),
            };
        }
    }
    if (AGENT_NAMES.every((name) => partial[name] !== undefined)) {
        return partial;
    }
    const filled = fillAgentsFromModels(partial, models);
    if (filled === null) {
        return null;
    }
    return filled;
}
function fillAgentsFromModels(partial, models) {
    const explorerModel = partial.explorer?.model ?? models.default;
    const reasoningModel = partial.reasoning?.model ?? models.reasoning ?? models.default;
    const codingModel = partial.coding?.model ?? models.coding ?? models.default;
    if (explorerModel === null || reasoningModel === null || codingModel === null) {
        return null;
    }
    return {
        explorer: {
            model: explorerModel,
            reasoningLevel: partial.explorer?.reasoningLevel ?? defaultReasoningForAgent("explorer"),
        },
        reasoning: {
            model: reasoningModel,
            reasoningLevel: partial.reasoning?.reasoningLevel ?? defaultReasoningForAgent("reasoning"),
        },
        coding: {
            model: codingModel,
            reasoningLevel: partial.coding?.reasoningLevel ?? defaultReasoningForAgent("coding"),
        },
    };
}
function readLazycodexModelsSection(text) {
    const section = readTomlSection(text, "lazycodex.models");
    return {
        default: parseTomlString(section.default),
        reasoning: parseTomlString(section.reasoning),
        coding: parseTomlString(section.coding),
    };
}
function readTomlSection(source, sectionName) {
    const header = `[${sectionName}]`;
    const start = source.indexOf(header);
    if (start === -1) {
        return {};
    }
    const bodyStart = start + header.length;
    const rest = source.slice(bodyStart);
    const next = /\n\[[^\n]+]/.exec(rest);
    const body = next?.index === undefined ? rest : rest.slice(0, next.index);
    const out = {};
    for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) {
            continue;
        }
        const eq = trimmed.indexOf("=");
        if (eq === -1) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        const raw = trimmed.slice(eq + 1).trim();
        out[key] = raw;
    }
    return out;
}
function parseTomlString(raw) {
    if (raw === undefined) {
        return null;
    }
    const trimmed = raw.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        return trimmed.slice(1, -1).replace(/\\"/g, '"');
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
        return trimmed.slice(1, -1);
    }
    return trimmed.length > 0 ? trimmed : null;
}
function parseReasoningLevel(raw) {
    const value = parseTomlString(raw);
    if (value === null) {
        return null;
    }
    return REASONING_LEVELS.includes(value) ? value : null;
}
function defaultReasoningForAgent(name) {
    if (name === "reasoning") {
        return "high";
    }
    return "medium";
}
