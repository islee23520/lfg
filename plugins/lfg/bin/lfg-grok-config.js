import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { upsertModelSections } from "./lfg-grok-model-sections";
import { defaultLazycodexAgentConfig } from "./lfg-models";
const LFG_OWNED_GROK_CONFIG_SECTIONS = [
  "endpoints.models_base_url",
  "models.default",
  "model.*",
  "lazycodex.models",
  "lazycodex.agents"
];
async function writeGrokModelConfig(discovery, options = {}) {
  const home = options.home ?? homedir();
  const path = join(home, ".grok", "config.toml");
  const baseUrl = modelsBaseUrl(discovery);
  const current = await readTextIfExists(path);
  const endpoints = removeTomlKey(upsertTomlKey(current, "endpoints", "models_base_url", baseUrl), "endpoints", "api_key");
  const agentConfig = options.agentConfig ?? discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery);
  const modelConfig = upsertModelSections(upsertSection(endpoints, "models", [`default = ${tomlString(discovery.mapping.default)}`]), discovery, baseUrl, options.apiKey, current);
  let withAgents = upsertLazycodexAgentSections(modelConfig, agentConfig);
  if (options.fullAgentModels && Object.keys(options.fullAgentModels).length > 0) {
    withAgents = upsertAllLazycodexAgentSections(withAgents, options.fullAgentModels);
  }
  const next = upsertSection(
    withAgents,
    "lazycodex.models",
    [
      `default = ${tomlString(discovery.mapping.default)}`,
      `fast = ${tomlString(discovery.mapping.fast)}`,
      `reasoning = ${tomlString(discovery.mapping.reasoning)}`,
      `coding = ${tomlString(discovery.mapping.coding)}`
    ]
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");
  return { status: "configured", path, modelsBaseUrl: baseUrl };
}
function grokConfigJson(update) {
  return {
    status: update.status,
    path: update.path,
    modelsBaseUrl: update.modelsBaseUrl
  };
}
async function refreshGrokModelConfig(discovery, options = {}) {
  const home = options.home ?? homedir();
  if (discovery === null) {
    return {
      ok: false,
      status: "no_discovery",
      discovery: null,
      configUpdate: null,
      modelsBaseUrl: null
    };
  }
  const agentConfig = options.agentConfig ?? discovery.agentConfig ?? defaultLazycodexAgentConfig(discovery);
  const configUpdate = await writeGrokModelConfig(discovery, {
    home,
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    agentConfig
  });
  return {
    ok: true,
    status: "refreshed",
    discovery,
    configUpdate,
    modelsBaseUrl: configUpdate.modelsBaseUrl
  };
}
function modelsBaseUrl(discovery) {
  return discovery.modelsUrl.endsWith("/models") ? discovery.modelsUrl.slice(0, -"/models".length) : discovery.baseUrl;
}
async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}
function isBareKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key);
}
function parseKeyPath(section) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < section.length; i++) {
    const char = section[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "." && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length > 0 || parts.length === 0) {
    parts.push(current);
  }
  return parts;
}
function makeKeyPattern(part) {
  const escaped = escapeRegExp(part);
  if (isBareKey(part)) {
    return `(?:"${escaped}"|'${escaped}'|${escaped})`;
  }
  return `(?:"${escaped}"|'${escaped}')`;
}
function makeSectionRegex(section, flags = "") {
  const parts = parseKeyPath(section);
  const partPatterns = parts.map(makeKeyPattern);
  const patternStr = `(^|\\n)\\[\\s*${partPatterns.join("\\s*\\.\\s*")}\\s*\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`;
  return new RegExp(patternStr, flags);
}
function upsertSection(source, section, lines) {
  const block = `[${section}]
${lines.join("\n")}
`;
  if (makeSectionRegex(section).test(source)) {
    let replaced = false;
    return source.replace(makeSectionRegex(section, "g"), (match) => {
      const prefix = match.startsWith("\n") ? "\n" : "";
      if (replaced) {
        return prefix;
      }
      replaced = true;
      return `${prefix}${block}`;
    });
  }
  const trimmed = source.trimEnd();
  return trimmed.length === 0 ? block : `${trimmed}

${block}`;
}
function upsertLazycodexAgentSections(source, agentConfig) {
  return Object.entries(agentConfig).reduce(
    (next, [agentName, setting]) => upsertSection(next, `lazycodex.agents.${agentName}`, [
      `model = ${tomlString(setting.model)}`,
      `reasoning_level = ${tomlString(setting.reasoningLevel)}`
    ]),
    source
  );
}
function upsertAllLazycodexAgentSections(source, full) {
  return Object.entries(full).reduce(
    (next, [agentName, setting]) => isBareKey(agentName) ? upsertSection(next, `lazycodex.agents.${agentName}`, [
      `model = ${tomlString(setting.model)}`,
      `reasoning_level = ${tomlString(setting.reasoningLevel)}`
    ]) : next,
    source
  );
}
function removeTomlKey(source, section, key) {
  const header = `[${section}]`;
  const start = source.indexOf(header);
  if (start === -1) {
    return source;
  }
  const end = nextSectionStart(source, start + header.length);
  const before = source.slice(0, start);
  const body = source.slice(start, end);
  const after = source.slice(end);
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, "m");
  const lines = body.split("\n").filter((line) => !pattern.test(line));
  return `${before}${lines.join("\n")}${after}`;
}
function upsertTomlKey(source, section, key, value) {
  const header = `[${section}]`;
  const start = source.indexOf(header);
  if (start === -1) {
    return upsertSection(source, section, [`${key} = ${tomlString(value)}`]);
  }
  const end = nextSectionStart(source, start + header.length);
  const before = source.slice(0, start);
  const body = source.slice(start, end);
  const after = source.slice(end);
  return `${before}${upsertSectionBody(body, key, value)}${after}`;
}
function nextSectionStart(source, from) {
  const match = /\n\[[^\n]+]/.exec(source.slice(from));
  return match?.index === void 0 ? source.length : from + match.index + 1;
}
function upsertSectionBody(body, key, value) {
  const replacement = `${key} = ${tomlString(value)}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=`);
  const lines = body.split("\n");
  const replaced = lines.map((line) => pattern.test(line.trimStart()) ? replacement : line);
  if (replaced.includes(replacement)) {
    return replaced.join("\n");
  }
  const insertAt = replaced.length > 0 && replaced[replaced.length - 1] === "" ? replaced.length - 1 : replaced.length;
  replaced.splice(insertAt, 0, replacement);
  return replaced.join("\n");
}
function tomlString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
export {
  LFG_OWNED_GROK_CONFIG_SECTIONS,
  grokConfigJson,
  refreshGrokModelConfig,
  writeGrokModelConfig
};
