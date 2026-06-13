import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { overrideForAgent } from "./lazycodex-agent-overrides";
import { renderGrokRoleTomlFromCodex, renderMinimalGrokRoleToml } from "./codex-agent-toml-to-grok";
import { resolveGrokAdapterPluginRoot } from "./grok-adapter-paths";
import { resolveFlavourPackAssetsRoot } from "./resolve-flavour-pack-asset";
const ULTRAWORK_AGENTS_DIR = join("components", "ultrawork", "agents");
const GROK_AGENT_NAMES = {
  plan: "plan",
  explorer: "explorer",
  librarian: "librarian",
  metis: "metis",
  momus: "momus",
  "codex-ultrawork-reviewer": "reviewer",
  reasoning: "reasoning",
  coding: "coding"
};
const READ_ONLY_AGENT_NAMES = /* @__PURE__ */ new Set(["plan", "explorer", "librarian", "metis", "momus", "codex-ultrawork-reviewer"]);
async function syncLazycodexAgentsToGrokLedger(home, agentOverrides) {
  const resolved = await resolveGrokAdapterPluginRoot(home);
  if (resolved === null) return null;
  const sourceDir = join(resolved.pluginRoot, ULTRAWORK_AGENTS_DIR);
  const entries = await readTomlEntries(sourceDir) ?? [];
  const agentsDir = join(resolved.pluginRoot, "agents");
  const rolesDir = join(home, ".grok", "roles");
  const personasDir = join(home, ".grok", "personas");
  const promptsDir = join(home, ".grok", "prompts", "lazycodex");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(rolesDir, { recursive: true });
  await mkdir(personasDir, { recursive: true });
  await mkdir(promptsDir, { recursive: true });
  await moveConflictingUserAgentsAside(home, [...Object.values(GROK_AGENT_NAMES)]);
  const written = [];
  const syncedNames = /* @__PURE__ */ new Set();
  for (const fileName of entries) {
    const sourceName = fileName.slice(0, -".toml".length);
    const grokName = GROK_AGENT_NAMES[sourceName] ?? sourceName;
    const codexText = await readFile(join(sourceDir, fileName), "utf8");
    const override = overrideForAgent(agentOverrides, sourceName);
    written.push(...await writeMappedAgentSurfaces({ codexText, sourceName, grokName, override, agentsDir, rolesDir, personasDir, promptsDir }));
    syncedNames.add(sourceName);
  }
  const flavourRoot = await resolveFlavourPackAssetsRoot(import.meta.url);
  const flavourEntries = await readTomlEntries(join(flavourRoot, "agent-configs"));
  for (const fileName of flavourEntries ?? []) {
    const sourceName = fileName.slice(0, -".toml".length);
    if (syncedNames.has(sourceName)) continue;
    const grokName = sourceName;
    const codexText = await readFile(join(flavourRoot, "agent-configs", fileName), "utf8");
    const override = overrideForAgent(agentOverrides, sourceName);
    written.push(...await writeMappedAgentSurfaces({ codexText, sourceName, grokName, override, agentsDir, rolesDir, personasDir, promptsDir }));
    syncedNames.add(sourceName);
  }
  for (const [sourceName, grokName] of Object.entries(GROK_AGENT_NAMES)) {
    if (syncedNames.has(sourceName)) continue;
    const override = overrideForAgent(agentOverrides, sourceName);
    if (override === void 0) continue;
    written.push(...await writeMinimalAgentSurfaces({ sourceName, grokName, override, agentsDir, rolesDir, promptsDir }));
  }
  return { ok: true, agentsDir, rolesDir, personasDir, promptsDir, written, sourcePluginRoot: resolved.pluginRoot };
}
async function writeMappedAgentSurfaces(args) {
  const meta = parseCodexAgentMeta(args.codexText);
  const role = renderGrokRoleTomlFromCodex(args.codexText, args.grokName, args.override, args.promptsDir);
  const prompt = role.promptBody ?? `${meta.instructions}
`;
  const promptPath = join(args.promptsDir, `${args.grokName}.md`);
  const rolePath = join(args.rolesDir, `${args.grokName}.toml`);
  const agentPath = join(args.agentsDir, `${args.grokName}.md`);
  const personaPath = join(args.personasDir, `${args.grokName}.toml`);
  await writeFile(promptPath, prompt, "utf8");
  await writeFile(rolePath, role.toml.replace(`${args.promptsDir}/${args.grokName}.md`, promptPath), "utf8");
  await writeFile(agentPath, renderAgentMarkdown(args.grokName, meta, args.sourceName, args.override), "utf8");
  await writeFile(personaPath, renderPersonaToml(meta, promptPath, args.override), "utf8");
  return [agentPath, rolePath, personaPath, promptPath];
}
async function writeMinimalAgentSurfaces(args) {
  const promptPath = join(args.promptsDir, `${args.grokName}.md`);
  const rolePath = join(args.rolesDir, `${args.grokName}.toml`);
  const agentPath = join(args.agentsDir, `${args.grokName}.md`);
  const prompt = `You are the LFG LazyCodex ${args.sourceName} agent. Complete the assigned task directly, keep scope tight, and verify before final response.
`;
  const meta = {
    description: `LFG LazyCodex ${args.sourceName} agent.`,
    instructions: prompt,
    model: args.override.model,
    reasoning: args.override.reasoningLevel
  };
  await writeFile(promptPath, prompt, "utf8");
  await writeFile(rolePath, renderMinimalGrokRoleToml(args.grokName, args.override), "utf8");
  await writeFile(agentPath, renderAgentMarkdown(args.grokName, meta, args.sourceName, args.override), "utf8");
  return [agentPath, rolePath, promptPath];
}
function renderAgentMarkdown(grokName, meta, sourceName, override) {
  const model = override?.model ?? meta.model;
  const permission = READ_ONLY_AGENT_NAMES.has(sourceName) ? "plan" : "default";
  return `---
name: ${grokName}
description: >
  ${meta.description}
prompt_mode: full
model: ${model}
permission_mode: ${permission}
agents_md: true
---

<!-- Source: omo/lazycodex components/ultrawork/agents/${sourceName}.toml; reasoning_effort=${override?.reasoningLevel ?? meta.reasoning} -->

${meta.instructions.trim()}
`;
}
function renderPersonaToml(meta, promptPath, override) {
  return [
    `description = ${JSON.stringify(meta.description)}`,
    `instructions_file = ${JSON.stringify(promptPath)}`,
    `model = ${JSON.stringify(override?.model ?? meta.model)}`,
    `reasoning_effort = ${JSON.stringify(override?.reasoningLevel ?? meta.reasoning)}`,
    `default_isolation = "none"`,
    ""
  ].join("\n");
}
function parseCodexAgentMeta(text) {
  return {
    description: parseScalar(text, "description") ?? "LFG LazyCodex agent.",
    instructions: parseTriple(text, "developer_instructions") ?? "Complete the assigned task.\n",
    model: parseScalar(text, "model") ?? "inherit",
    reasoning: parseScalar(text, "model_reasoning_effort") ?? "medium"
  };
}
function parseScalar(text, key) {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(text);
  return match?.[1] ?? null;
}
function parseTriple(text, key) {
  const match = new RegExp(`${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m").exec(text);
  return match?.[1]?.trim() ?? null;
}
async function readTomlEntries(dir) {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith(".toml")).sort();
  } catch {
    return null;
  }
}
async function moveConflictingUserAgentsAside(home, names) {
  await moveConflictingMarkdownAgentsAside(home, names);
  const userAgentsDir = join(home, ".grok", "agents");
  const tomlBackupDir = join(home, ".grok", "agents-toml-backup-lfg");
  await mkdir(tomlBackupDir, { recursive: true });
  for (const entry of await readTomlEntries(userAgentsDir) ?? []) await moveIfExists(join(userAgentsDir, entry), join(tomlBackupDir, basename(entry)));
}
async function moveConflictingMarkdownAgentsAside(home, names) {
  const userAgentsDir = join(home, ".grok", "agents");
  const mdBackupDir = join(home, ".grok", "agents-user-backup-lfg");
  await mkdir(mdBackupDir, { recursive: true });
  for (const name of names) await moveIfExists(join(userAgentsDir, `${name}.md`), join(mdBackupDir, `${name}.md`));
}
async function moveIfExists(source, dest) {
  try {
    const text = await readFile(source, "utf8");
    if (!await fileExists(dest)) await writeFile(dest, text, "utf8");
    await unlink(source);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
}
async function fileExists(path) {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}
function isNodeError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}
export {
  syncLazycodexAgentsToGrokLedger
};
