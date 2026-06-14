import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyLfgConfigToAgentOverrides, readLfgConfigFile } from "./lfg-config";
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset";
export const LAZYCODEX_AGENT_OVERRIDES_FILENAME = "lazycodex-agent-overrides.json";
/** OMO / ultrawork agents users can tune per agent (LFP-style). */
export const CONFIGURABLE_LAZYCODEX_AGENT_NAMES = [
    "default",
    "ulw",
    "explorer",
    "reasoning",
    "coding",
    "librarian",
    "plan",
    "metis",
    "momus",
    "codex-ultrawork-reviewer",
];
export function lazycodexAgentOverridesPath(home) {
    return join(home, ".grok", LAZYCODEX_AGENT_OVERRIDES_FILENAME);
}
export async function readLazycodexAgentOverridesFile(home) {
    try {
        const raw = await readFile(lazycodexAgentOverridesPath(home), "utf8");
        return parseOverridesJson(JSON.parse(raw));
    }
    catch {
        return {};
    }
}
export async function writeLazycodexAgentOverridesFile(home, overrides) {
    const path = lazycodexAgentOverridesPath(home);
    await mkdir(join(home, ".grok"), { recursive: true });
    const body = {
        version: 1,
        overrides: Object.fromEntries(Object.entries(overrides).map(([name, setting]) => [
            name,
            {
                model: setting.model,
                reasoning_level: setting.reasoningLevel,
                ...(setting.serviceTier !== undefined ? { service_tier: setting.serviceTier } : {}),
                ...(setting.modelFallback !== undefined ? { model_fallback: setting.modelFallback } : {}),
                ...(setting.modelFallbackReasoningLevel !== undefined ? { model_fallback_reasoning_effort: setting.modelFallbackReasoningLevel } : {}),
                ...(setting.modelFallbackServiceTier !== undefined ? { model_fallback_service_tier: setting.modelFallbackServiceTier } : {}),
            },
        ])),
    };
    await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return path;
}
export async function loadBundledDefaultOmoOverrides(moduleUrl) {
    try {
        const root = await resolveFlavourPackAssetsRoot(moduleUrl ?? import.meta.url);
        const raw = await readFile(join(root, "omo-agent-overrides.json"), "utf8");
        const parsed = JSON.parse(raw);
        const out = {};
        for (const [name, fields] of Object.entries(parsed.overrides ?? {})) {
            const model = fields.model;
            const level = fields.reasoning_level ?? fields.model_reasoning_effort;
            if (typeof model === "string" && model.length > 0 && isReasoningLevel(level)) {
                out[name] = parseOverrideFields(model, level, fields);
            }
        }
        return out;
    }
    catch {
        return {};
    }
}
/** Merge: user file > role discovery config > bundled LFP-style defaults. */
export function mergeLazycodexAgentOverrides(roleConfig, bundled, fromFile) {
    const merged = { ...bundled, ...fromFile };
    merged.explorer = mergeRoleWithBundled(fromFile.explorer, roleConfig.explorer, bundled.explorer);
    merged.reasoning = mergeRoleWithBundled(fromFile.reasoning, roleConfig.reasoning, bundled.reasoning);
    merged.coding = mergeRoleWithBundled(fromFile.coding, roleConfig.coding, bundled.coding);
    return merged;
}
/** Role config provides model+reasoning; bundled provides fallback fields. User file wins overall. */
function mergeRoleWithBundled(fromFile, role, bundled) {
    if (fromFile !== undefined)
        return fromFile;
    return {
        model: role.model,
        reasoningLevel: role.reasoningLevel,
        ...(bundled?.serviceTier !== undefined ? { serviceTier: bundled.serviceTier } : {}),
        ...(bundled?.modelFallback !== undefined ? { modelFallback: bundled.modelFallback } : {}),
        ...(bundled?.modelFallbackReasoningLevel !== undefined ? { modelFallbackReasoningLevel: bundled.modelFallbackReasoningLevel } : {}),
        ...(bundled?.modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier: bundled.modelFallbackServiceTier } : {}),
    };
}
export async function resolveLazycodexAgentOverrides(home, roleConfig) {
    const [bundled, fromFile, lfgConfig] = await Promise.all([
        loadBundledDefaultOmoOverrides(),
        readLazycodexAgentOverridesFile(home),
        readLfgConfigFile(home),
    ]);
    return applyLfgConfigToAgentOverrides(mergeLazycodexAgentOverrides(roleConfig, bundled, fromFile), roleConfig, lfgConfig);
}
export function overrideForAgent(map, agentName) {
    return map[agentName];
}
function parseOverridesJson(data) {
    const out = {};
    for (const [name, fields] of Object.entries(data.overrides ?? {})) {
        const model = fields.model;
        const level = fields.reasoning_level;
        if (typeof model === "string" && model.length > 0 && isReasoningLevel(level)) {
            out[name] = parseOverrideFields(model, level, fields);
        }
    }
    return out;
}
function parseOverrideFields(model, reasoningLevel, fields) {
    return {
        model,
        reasoningLevel,
        ...(isServiceTier(fields.service_tier) ? { serviceTier: fields.service_tier } : {}),
        ...(typeof fields.model_fallback === "string" && fields.model_fallback.length > 0 ? { modelFallback: fields.model_fallback } : {}),
        ...(isReasoningLevel(fields.model_fallback_reasoning_effort) ? { modelFallbackReasoningLevel: fields.model_fallback_reasoning_effort } : {}),
        ...(isServiceTier(fields.model_fallback_service_tier) ? { modelFallbackServiceTier: fields.model_fallback_service_tier } : {}),
    };
}
function isReasoningLevel(value) {
    return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}
function isServiceTier(value) {
    return value === "default" || value === "fast";
}
