#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const input = parseJson(await readStdin());
const event = normalizeHookEventName(input);
const home = process.env.HOME ?? homedir();
const configPath = join(home, ".grok", "lfg-config.jsonc");
const config = await readConfig(configPath);

if (config !== null) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: renderContext(configPath, config) } }));
}

async function readConfig(path) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw));
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function renderContext(path, config) {
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
  return lines.join("\n");
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

function normalizeHookEventName(record) {
  const raw = stringField(record ?? {}, "hookEventName") ?? stringField(record ?? {}, "hook_event_name") ?? process.env.GROK_HOOK_EVENT ?? "SessionStart";
  const snake = raw.includes("_") ? raw : raw.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return snake
    .split("_")
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

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function stripJsonComments(text) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    output += char;
  }
  return output;
}
