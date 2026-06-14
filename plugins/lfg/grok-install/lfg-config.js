import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
const ReasoningLevelSchema = z.union([z.literal("low"), z.literal("medium"), z.literal("high"), z.literal("xhigh")]);
const AgentConfigSchema = z
    .object({
    model: z.string().min(1).optional(),
    reasoning_level: ReasoningLevelSchema.optional(),
    enabled: z.boolean().optional(),
})
    .strict();
export const LfgConfigSchema = z
    .object({
    $schema: z.string().optional(),
    version: z.literal(1).default(1),
    models: z
        .object({
        default: z.string().min(1).optional(),
        fast: z.string().min(1).optional(),
        reasoning: z.string().min(1).optional(),
        coding: z.string().min(1).optional(),
    })
        .strict()
        .optional(),
    agents: z.record(z.string(), AgentConfigSchema).optional(),
    subagents: z
        .object({
        disableBuiltins: z.boolean().default(true),
        enabled: z.array(z.string().min(1)).optional(),
    })
        .strict()
        .optional(),
})
    .strict();
export const LFG_CONFIG_FILENAME = "lfg-config.jsonc";
export const LFG_CONFIG_SCHEMA_FILENAME = "lfg-config.schema.json";
export function lfgConfigPath(home) {
    return join(home, ".grok", LFG_CONFIG_FILENAME);
}
export function lfgConfigSchemaPath(home) {
    return join(home, ".grok", LFG_CONFIG_SCHEMA_FILENAME);
}
export async function readLfgConfigFile(home) {
    try {
        const raw = await readFile(lfgConfigPath(home), "utf8");
        return LfgConfigSchema.parse(JSON.parse(stripJsonComments(raw)));
    }
    catch {
        return null;
    }
}
export async function ensureLfgConfigFiles(home, seed) {
    const configPath = lfgConfigPath(home);
    const schemaPath = lfgConfigSchemaPath(home);
    await mkdir(join(home, ".grok"), { recursive: true });
    await writeFile(schemaPath, `${JSON.stringify(z.toJSONSchema(LfgConfigSchema), null, 2)}\n`, "utf8");
    try {
        await readFile(configPath, "utf8");
    }
    catch {
        await writeFile(configPath, renderDefaultLfgConfig(seed), "utf8");
    }
    return { configPath, schemaPath };
}
export function applyLfgConfigToAgentOverrides(base, roleConfig, config) {
    const merged = { ...base };
    for (const [name, agent] of Object.entries(config?.agents ?? {})) {
        const existing = merged[name] ?? agentFallback(name, roleConfig);
        const model = agent.model ?? existing?.model;
        const reasoningLevel = agent.reasoning_level ?? existing?.reasoningLevel;
        if (model !== undefined && reasoningLevel !== undefined) {
            merged[name] = {
                model,
                reasoningLevel,
                ...(existing?.serviceTier !== undefined ? { serviceTier: existing.serviceTier } : {}),
                ...(existing?.modelFallback !== undefined ? { modelFallback: existing.modelFallback } : {}),
                ...(existing?.modelFallbackReasoningLevel !== undefined ? { modelFallbackReasoningLevel: existing.modelFallbackReasoningLevel } : {}),
                ...(existing?.modelFallbackServiceTier !== undefined ? { modelFallbackServiceTier: existing.modelFallbackServiceTier } : {}),
            };
        }
    }
    return merged;
}
function agentFallback(name, roleConfig) {
    if (name === "explorer")
        return roleConfig.explorer;
    if (name === "reasoning")
        return roleConfig.reasoning;
    if (name === "coding")
        return roleConfig.coding;
    return undefined;
}
function renderDefaultLfgConfig(seed) {
    const agents = Object.fromEntries(Object.entries(seed).map(([name, value]) => [
        name,
        {
            model: value.model,
            reasoning_level: value.reasoningLevel,
            enabled: true,
            ...(value.serviceTier !== undefined ? { service_tier: value.serviceTier } : {}),
            ...(value.modelFallback !== undefined ? { model_fallback: value.modelFallback } : {}),
        },
    ]));
    return `${JSON.stringify({ $schema: `./${LFG_CONFIG_SCHEMA_FILENAME}`, version: 1, agents, subagents: { disableBuiltins: true } }, null, 2)}\n`;
}
function stripJsonComments(text) {
    let output = "";
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        if (char === undefined)
            continue;
        if (inString) {
            output += char;
            if (escaped) {
                escaped = false;
            }
            else if (char === "\\") {
                escaped = true;
            }
            else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            output += char;
            continue;
        }
        if (char === "/" && next === "/") {
            while (index < text.length && text[index] !== "\n")
                index += 1;
            output += "\n";
            continue;
        }
        if (char === "/" && next === "*") {
            index += 2;
            while (index < text.length && !(text[index] === "*" && text[index + 1] === "/"))
                index += 1;
            index += 1;
            continue;
        }
        output += char;
    }
    return output;
}
