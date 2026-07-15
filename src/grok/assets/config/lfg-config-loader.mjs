#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
const { inspectProjectOmoLedger } = await importFirst(["./lfg-project-omo-ledger.mjs", "../ledger/lfg-project-omo-ledger.mjs"]);
const { devLog } = await importFirst(["./lfg-dev-logger.mjs", "../log/lfg-dev-logger.mjs"]);

const TEST_HOME_ENABLED = "1";
const PROJECT_CONTEXT_MAX_CHARS = 2048;
const FIELD_MAX_CHARS = 160;

const input = parseJson(await readStdin());
const event = normalizeHookEventName(input);
const home = resolveGrokHome(process.env);
// Sole settings surface: ~/.grok/config.toml (lfg.json / lfg-config.jsonc are retired).
const grokConfigPath = join(home, ".grok", "config.toml");
const config = await readTomlAgentConfig(grokConfigPath);
const modelRestore = (event === "SessionStart" || event === "PostCompact") ? await restoreSessionDefaultModel(grokConfigPath) : null;
const projectRoot = projectRootFromInput(input);
const sessionId = sessionIdFromInput(input);
const ledger = await inspectProjectOmoLedger({ projectRoot, sessionId });
if (ledger.status === "malformed") {
  await devLog({ event, hook: "config-loader", level: "error", detail: "malformed .omo ledger", boulderPath: ledger.boulderPath });
  process.stderr.write(`LFG-OMO-LEDGER-ERROR: malformed project .omo state at ${ledger.boulderPath}\n`);
  if (event === "PostCompact") {
    process.stdout.write(JSON.stringify({ statusMessage: `LFG: ${event} (malformed .omo, skipped)` }) + "\n");
    process.exit(0);
  }
  process.exit(1); // SessionStart / UserPromptSubmit keep hard fail
}
const context = renderContext(grokConfigPath, config, ledger, modelRestore);

await devLog({
  event,
  hook: "config-loader",
  cwd: projectRoot,
  detail: {
    hasConfig: config !== null,
    configPath: config !== null ? grokConfigPath : null,
    agentCount: config?.agents ? Object.keys(config.agents).length : 0,
    agents: config?.agents ? Object.fromEntries(
      Object.entries(config.agents).map(([name, a]) => [name, { model: a?.model, reasoning: a?.reasoning_level, enabled: a?.enabled }])
    ) : null,
    ledgerStatus: ledger.status,
    modelRestore,
  },
});

if (context !== null) {
  // Emit both formats: statusMessage for Grok UI visibility during SessionStart,
  // and hookSpecificOutput for internal LFG context that other hooks can consume.
  const statusMessage = `LFG: ${event === "SessionStart" ? "Session initialized" : "Context loaded"} (${config ? "config+agents" : "no-config"})${ledger.status === "present" && ledger.work ? " + active work" : ""}`;
  process.stdout.write(JSON.stringify({
    statusMessage,
    hookSpecificOutput: { hookEventName: event, additionalContext: context }
  }) + "\n");
} else {
  // Still emit minimal status when there's no context to show
  process.stdout.write(JSON.stringify({
    statusMessage: `LFG: ${event} (no config or active work)`
  }) + "\n");
}

/** Parse [omo.agents.*] + [omo.models] from config.toml into the legacy config shape. */
async function readTomlAgentConfig(path) {
  try {
    const raw = await readFile(path, "utf8");
    const agents = {};
    const agentHeader = /^\[omo\.agents\.([^\]]+)\]\s*(?:#.*)?$/;
    const lines = raw.split(/\r?\n/);
    let current = null;
    for (const line of lines) {
      const header = line.match(agentHeader);
      if (header) {
        current = header[1];
        agents[current] = agents[current] ?? {};
        continue;
      }
      if (current !== null && /^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line)) {
        current = null;
      }
      if (current === null) continue;
      const model = line.match(/^\s*model\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/);
      if (model) agents[current].model = model[2];
      const reasoning =
        line.match(/^\s*reasoning_level\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/) ||
        line.match(/^\s*reasoning_effort\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/);
      if (reasoning) agents[current].reasoning_level = reasoning[2];
    }
    for (const name of Object.keys(agents)) {
      agents[name].enabled = true;
    }
    const models = {};
    const modelKeys = ["default", "fast", "reasoning", "coding"];
    for (const key of modelKeys) {
      const value = readTomlStringKey(raw, "omo.models", key);
      if (value !== null) models[key] = value;
    }
    const hasAgents = Object.keys(agents).length > 0;
    const hasModels = Object.keys(models).length > 0;
    if (!hasAgents && !hasModels) return null;
    return {
      version: 1,
      ...(hasAgents ? { agents } : {}),
      ...(hasModels ? { models } : {}),
    };
  } catch {
    return null;
  }
}

async function restoreSessionDefaultModel(path) {
  try {
    const raw = await readFile(path, "utf8");
    // seed-only: lfg owns a default *seed* in omo.models.default, but it must
    // never overwrite an existing [models].default. The user's (or Grok's)
    // chosen model has to persist across sessions for Grok Build to freely use
    // many models; lfg only fills the default when none exists yet.
    const seedModel = readTomlStringKey(raw, "omo.models", "default");
    if (seedModel === null) return null;
    const currentDefault = readTomlStringKey(raw, "models", "default");
    if (currentDefault !== null) {
      return { targetModel: currentDefault, restored: false };
    }
    const next = upsertTomlStringKey(raw, "models", "default", seedModel);
    await writeFile(path, next, "utf8");
    return { targetModel: seedModel, restored: true };
  } catch {
    return null;
  }
}

function readTomlStringKey(source, section, key) {
  const lines = tomlSectionLines(source, section);
  if (lines === null) return null;
  for (const line of lines) {
    const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*([\"'])(.*?)\\1\\s*(?:#.*)?$`));
    if (match) return match[2] ?? null;
  }
  return null;
}

function upsertTomlStringKey(source, section, key, value) {
  const lines = source.split(/(?<=\n)/);
  const header = `[${section}]`;
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]?.trim() === header) {
      sectionStart = index;
      break;
    }
  }
  if (sectionStart === -1) {
    const prefix = source.length > 0 && !source.endsWith("\n") ? "\n" : "";
    return `${source}${prefix}\n${header}\n${key} = ${tomlString(value)}\n`;
  }
  for (let index = sectionStart + 1; index < lines.length; index++) {
    if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[index] ?? "")) {
      sectionEnd = index;
      break;
    }
  }
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let index = sectionStart + 1; index < sectionEnd; index++) {
    if (keyPattern.test(lines[index] ?? "")) {
      lines[index] = `${key} = ${tomlString(value)}\n`;
      return lines.join("");
    }
  }
  lines.splice(sectionEnd, 0, `${key} = ${tomlString(value)}\n`);
  return lines.join("");
}

function tomlSectionLines(source, section) {
  const lines = source.split(/\r?\n/);
  const header = `[${section}]`;
  let start = -1;
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]?.trim() === header) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return null;
  const sectionLines = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line)) break;
    sectionLines.push(line);
  }
  return sectionLines;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveGrokHome(env) {
  if (env.LFG_ALLOW_TEST_GROK_HOME === TEST_HOME_ENABLED) {
    const explicitTestHome = env.LFG_TEST_GROK_HOME?.trim();
    if (explicitTestHome) return explicitTestHome;
    const isolatedHome = env.HOME?.trim();
    if (isolatedHome) return isolatedHome;
  }
  try {
    const home = userInfo().homedir.trim();
    if (home.length > 0) return home;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }
  return homedir();
}

function renderContext(path, config, ledger, modelRestore) {
  const lines = [];
  if (modelRestore?.targetModel) {
    lines.push(`LFG session model default: ${sanitizeField(modelRestore.targetModel)}${modelRestore.restored ? " (restored in config.toml)" : ""}.`);
  }
  if (ledger.status === "present" && ledger.work !== null) {
    lines.push(...renderProjectOmoLedger(ledger));
  }
  if (config !== null) {
    lines.push(...renderGlobalConfig(path, config));
  }
  return lines.length > 0 ? boundContextText(lines.join("\n")) : null;
}

function renderGlobalConfig(path, config) {
  const lines = [`LFG global config loaded from ${path}.`];
  const agents = objectField(config, "agents");
  if (agents !== null) {
    const names = Object.keys(agents).sort();
    if (names.length > 0) {
      lines.push(`Configured LFG agents: ${names.join(", ")}.`);
      for (const name of names) {
        const agent = objectField(agents, name);
        if (agent === null) continue;
        const model = stringField(agent, "model");
        const reasoning = stringField(agent, "reasoning_level");
        const enabled = booleanField(agent, "enabled");
        const parts = [];
        if (model !== null) parts.push(`model=${model}`);
        if (reasoning !== null) parts.push(`reasoning=${reasoning}`);
        if (enabled !== null) parts.push(`enabled=${enabled ? "true" : "false"}`);
        if (parts.length > 0) lines.push(`- ${name}: ${parts.join(", ")}`);
      }
    }
  }
  const models = objectField(config, "models");
  if (models !== null) {
    const entries = Object.entries(models)
      .filter((entry) => typeof entry[1] === "string" && entry[1].length > 0)
      .map((entry) => `${entry[0]}=${entry[1]}`);
    if (entries.length > 0) lines.push(`LFG model aliases: ${entries.join(", ")}.`);
  }
  return lines;
}

function renderProjectOmoLedger(ledger) {
  const lines = [
    `LFG project .omo ledger loaded from ${sanitizeField(ledger.boulderPath)}.`,
    `Active work: ${sanitizeField(ledger.work.workId)}`,
    `Plan: ${sanitizeField(ledger.work.planName)}`,
    `Status: ${sanitizeField(ledger.work.status)}`,
    `Active plan: ${sanitizeField(ledger.work.activePlan)}`,
  ];
  if (ledger.work.worktreePath !== null) lines.push(`Worktree: ${sanitizeField(ledger.work.worktreePath)}`);
  lines.push(`Matched by: ${sanitizeField(ledger.matchedBy ?? "none")}`);
  lines.push(`Ledger exists: ${ledger.ledgerExists ? "true" : "false"}`);
  lines.push(`Ledger line count: ${ledger.ledgerLineCount}`);
  const resumeOptions = Array.isArray(ledger.resumeOptions) ? ledger.resumeOptions : [];
  const ledgerPreviews = Array.isArray(ledger.ledgerPreviews) ? ledger.ledgerPreviews : [];
  if (resumeOptions.length > 0 || ledgerPreviews.length > 0) {
    lines.push("Previous OMO context: awareness-only; continuation remains Deferred.");
    for (const option of resumeOptions.slice(0, 3)) {
      if (!option || typeof option !== "object") continue;
      const workId = stringField(option, "workId");
      const planName = stringField(option, "planName");
      const status = stringField(option, "status");
      const sessionCount = numberField(option, "sessionCount");
      if (workId !== null && planName !== null && status !== null && sessionCount !== null) {
        lines.push(`Resumable awareness: ${sanitizeField(workId)} (${sanitizeField(planName)}, ${sanitizeField(status)}, sessions=${sessionCount})`);
      }
    }
    for (const preview of ledgerPreviews.slice(0, 5)) {
      if (!preview || typeof preview !== "object") continue;
      const source = stringField(preview, "source");
      const lineCount = numberField(preview, "lineCount");
      const previewSessionId = stringField(preview, "sessionId");
      const truncated = booleanField(preview, "truncated") === true;
      if (source !== null && lineCount !== null) {
        const sessionSuffix = previewSessionId !== null ? `, session=${sanitizeField(previewSessionId)}` : "";
        const truncatedSuffix = truncated ? ", truncated=true" : "";
        lines.push(`Ledger preview: ${sanitizeField(source)}${sessionSuffix}, lines=${lineCount}${truncatedSuffix}`);
      }
    }
  }
  const ul = ledger.ulwLoop;
  if (ul && typeof ul === "object" && ul.present) {
    lines.push(`ulw-loop sessions: ${ul.sessionCount}`);
    lines.push(`ulw-loop has active ledger: ${ul.hasActiveLedger ? "true" : "false"}`);
  } else {
    lines.push("ulw-loop: none");
  }
  return boundContextLines(lines);
}

function boundContextText(text) {
  if (text.length <= PROJECT_CONTEXT_MAX_CHARS) return text;
  const marker = "\nProject context truncated.";
  return `${text.slice(0, PROJECT_CONTEXT_MAX_CHARS - marker.length)}${marker}`;
}

function sanitizeField(value) {
  const normalized = String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return "[empty]";
  if (isSecretLike(normalized)) return "[redacted]";
  return normalized.length > FIELD_MAX_CHARS ? `${normalized.slice(0, FIELD_MAX_CHARS - 1)}…` : normalized;
}

function isSecretLike(value) {
  const lower = value.toLowerCase();
  if (/\b(api[_-]?key|authorization|bearer|secret|token|password|credential)\b/i.test(value)) return true;
  if (/\bsk-[a-z0-9][a-z0-9_-]{8,}\b/i.test(value)) return true;
  if (/\b[a-z0-9_-]{32,}\.[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\b/i.test(value)) return true;
  if (lower.includes("-----begin ")) return true;
  return /^[A-Za-z0-9+/=_-]{48,}$/.test(value);
}

function boundContextLines(lines) {
  const bounded = [];
  for (const line of lines) {
    const next = [...bounded, line].join("\n");
    if (next.length <= PROJECT_CONTEXT_MAX_CHARS) {
      bounded.push(line);
      continue;
    }
    appendTruncationMarker(bounded);
    return bounded;
  }
  return bounded;
}

function appendTruncationMarker(lines) {
  const marker = "Project .omo context truncated.";
  while (lines.length > 0 && [...lines, marker].join("\n").length > PROJECT_CONTEXT_MAX_CHARS) {
    lines.pop();
  }
  if ([...lines, marker].join("\n").length <= PROJECT_CONTEXT_MAX_CHARS) lines.push(marker);
}

function projectRootFromInput(record) {
  return stringField(record ?? {}, "cwd")
    ?? stringField(record ?? {}, "workspaceRoot")
    ?? stringField(record ?? {}, "workspace_root")
    ?? stringField(record ?? {}, "CLAUDE_PROJECT_DIR")
    ?? process.env.GROK_WORKSPACE_ROOT
    ?? process.env.CLAUDE_PROJECT_DIR
    ?? process.cwd();
}

function sessionIdFromInput(record) {
  return stringField(record ?? {}, "sessionId") ?? stringField(record ?? {}, "session_id");
}

function objectField(record, key) {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function stringField(record, key) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanField(record, key) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function numberField(record, key) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeHookEventName(record) {
  const raw = stringField(record ?? {}, "hookEventName") ?? stringField(record ?? {}, "hook_event_name") ?? process.env.GROK_HOOK_EVENT ?? "SessionStart";
  const snake = raw.includes("_") ? raw : raw.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return snake
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("") || "SessionStart";
}

function parseJson(raw) {
  try {
    const parsed = JSON.parse(raw.trim());
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

async function importFirst(specifiers) {
  let lastError;
  for (const specifier of specifiers) {
    try {
      return await import(specifier);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
