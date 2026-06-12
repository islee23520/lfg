import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mergeAgentTomlOverrides } from "./agent-overrides";
const AGENT_NAMES = ["explorer", "reasoning", "coding"];
/** Write ~/.grok/agents/<name>.toml from lazycodex agent config (idempotent merge). */
export async function applyLazycodexAgentTomls(home, agentConfig) {
    const agentsDir = join(home, ".grok", "agents");
    await mkdir(agentsDir, { recursive: true });
    const written = [];
    for (const name of AGENT_NAMES) {
        const setting = agentConfig[name];
        const path = join(agentsDir, `${name}.toml`);
        const current = await readAgentTomlIfExists(path);
        const body = mergeAgentTomlOverrides(current, {
            model: setting.model,
            reasoningLevel: setting.reasoningLevel,
        });
        await writeFile(path, body, "utf8");
        written.push(path);
    }
    return { ok: true, agentsDir, written };
}
async function readAgentTomlIfExists(path) {
    try {
        return await readFile(path, "utf8");
    }
    catch {
        return "";
    }
}
