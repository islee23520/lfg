import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export const LFG_SHADOW_AGENT_NAMES = ["general-purpose", "explore", "grok-build", "builder", "ulw"];
export async function writeLfgShadowAgents(home, agentOverrides) {
    const shadowAgentsDir = join(home, ".grok", "agents");
    await mkdir(shadowAgentsDir, { recursive: true });
    await moveConflictingMarkdownAgentsAside(home, LFG_SHADOW_AGENT_NAMES);
    return writeShadowAgentSurfaces(shadowAgentsDir, agentOverrides);
}
async function writeShadowAgentSurfaces(shadowAgentsDir, agentOverrides) {
    const explorerModel = agentOverrides.explorer.model;
    const reasoningModel = agentOverrides.reasoning.model;
    const codingModel = agentOverrides.coding.model;
    const definitions = [
        {
            name: "general-purpose",
            description: "LFG LazyCodex general-purpose fallback agent. High-quality reasoning worker for broad research, analysis, and execution tasks when the default orchestrator is not required.",
            model: reasoningModel,
            permission: "default",
            body: "You are a high-quality general-purpose agent. Complete the assigned task directly using strong reasoning. Do exactly what was asked; nothing more, nothing less. Prefer concise, evidence-based responses.",
        },
        {
            name: "explore",
            description: "LFG LazyCodex codebase exploration agent replacing the Grok built-in. Finds files, symbols, code paths, and local implementation evidence. Read-only.",
            model: explorerModel,
            permission: "plan",
            body: "Role: codebase search specialist. Find files, symbols, code paths, and local implementation evidence. Return concise actionable results. Read-only.",
        },
        {
            name: "grok-build",
            description: "LFG LazyCodex builder agent replacing the Grok built-in. Implements scoped code changes, coordinates LFG workers, and verifies before final response.",
            model: codingModel,
            permission: "default",
            body: renderUlwBody("grok-build"),
        },
        {
            name: "builder",
            description: "LFG LazyCodex builder alias. Implements scoped code changes, coordinates LFG workers, and verifies before final response.",
            model: codingModel,
            permission: "default",
            body: renderUlwBody("builder"),
        },
        {
            name: "ulw",
            description: "LFG LazyCodex Sisyphus-style default orchestrator (ulw). Decomposes work into minimal concrete steps, delegates to specialized LFG workers (explorer/reasoning/coding/reviewer), preserves user intent, and closes the loop with verification evidence.",
            model: reasoningModel,
            permission: "default",
            body: renderUlwBody("ulw"),
        },
    ];
    const written = [];
    for (const definition of definitions) {
        const path = join(shadowAgentsDir, `${definition.name}.md`);
        await writeFile(path, renderShadowAgentMarkdown(definition), "utf8");
        written.push(path);
    }
    return written;
}
function renderShadowAgentMarkdown(definition) {
    return `---\nname: ${definition.name}\ndescription: >\n  ${definition.description}\nprompt_mode: full\nmodel: ${definition.model}\npermission_mode: ${definition.permission}\nagents_md: true\n---\n\n${definition.body.trim()}\n`;
}
function renderUlwBody(name) {
    return `You are ${name}, the **LFG LazyCodex Sisyphus-style default orchestrator**.

Core principles:
- Keep **one concrete goal** in focus at all times
- Decompose **only as much as needed** — prefer direct execution
- Use specialized LFG workers (explorer, reasoning, coding, reviewer, visual-qa, etc.) via subagent when it clearly helps
- Always preserve existing user changes and intent
- Verify the result with evidence before declaring completion
- Prefer concise, actionable output over ceremony or unnecessary planning

Do exactly what the user asked. Do not expand scope.`;
}
async function moveConflictingMarkdownAgentsAside(home, names) {
    const userAgentsDir = join(home, ".grok", "agents");
    const mdBackupDir = join(home, ".grok", "agents-user-backup-lfg");
    await mkdir(mdBackupDir, { recursive: true });
    for (const name of names)
        await moveIfExists(join(userAgentsDir, `${name}.md`), join(mdBackupDir, `${name}.md`));
}
async function moveIfExists(source, dest) {
    try {
        const text = await readFile(source, "utf8");
        await writeFile(dest, text, "utf8");
    }
    catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT")
            throw error;
    }
}
function isNodeError(error) {
    return typeof error === "object" && error !== null && "code" in error;
}
