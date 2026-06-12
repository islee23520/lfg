import { readFile, writeFile } from "node:fs/promises";
/** Merge model-related keys into agent TOML text without duplicating managed keys. */
export function mergeAgentTomlOverrides(current, override) {
    const lines = current.split("\n");
    const managed = new Set();
    if (override.model !== undefined)
        managed.add("model");
    if (override.reasoningLevel !== undefined)
        managed.add("model_reasoning_effort");
    const kept = lines.filter((line) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("#") || trimmed.length === 0)
            return true;
        const key = trimmed.split("=")[0]?.trim();
        return key === undefined || !managed.has(key);
    });
    const additions = [];
    if (override.model !== undefined)
        additions.push(`model = ${JSON.stringify(override.model)}`);
    if (override.reasoningLevel !== undefined)
        additions.push(`model_reasoning_effort = ${JSON.stringify(override.reasoningLevel)}`);
    const body = [...kept.filter((l) => l.trim().length > 0), ...additions].join("\n");
    return body.endsWith("\n") ? body : `${body}\n`;
}
export async function applyAgentOverrideFile(path, override) {
    const current = await readFile(path, "utf8");
    await writeFile(path, mergeAgentTomlOverrides(current, override), "utf8");
}
