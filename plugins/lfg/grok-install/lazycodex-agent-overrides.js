import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyLfgConfigToAgentOverrides, readLfgConfigFile } from "./lfg-config";
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset";
export const LAZYCODEX_AGENT_OVERRIDES_FILENAME = "lazycodex-agent-overrides.json";
/** OMO / ultrawork agents users can tune per agent (LFP-style). */
export const CONFIGURABLE_LAZYCODEX_AGENT_NAMES = [
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
            { model: setting.model, reasoning_level: setting.reasoningLevel },
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
            const level = fields.model_reasoning_effort;
            if (typeof model === "string" && model.length > 0 && isReasoningLevel(level)) {
                out[name] = { model, reasoningLevel: level };
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
    merged.explorer = fromFile.explorer ?? roleConfig.explorer;
    merged.reasoning = fromFile.reasoning ?? roleConfig.reasoning;
    merged.coding = fromFile.coding ?? roleConfig.coding;
    return merged;
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
            out[name] = { model, reasoningLevel: level };
        }
    }
    return out;
}
function isReasoningLevel(value) {
    return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}
