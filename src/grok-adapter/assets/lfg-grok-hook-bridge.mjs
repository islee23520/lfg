#!/usr/bin/env node
/**
 * Lazycodex component hooks expect Codex-shaped stdin + PLUGIN_ROOT/PLUGIN_DATA.
 * Grok sends camelCase hook JSON and GROK_PLUGIN_* env. This bridge adapts both.
 * lfg-grok-hook-bridge.mjs
 */
import { spawn } from "node:child_process";
import { stdin as processStdin } from "node:process";
import { devLog } from "./lfg-dev-logger.mjs";

const args = process.argv.slice(2);
if (args.length < 1) {
  process.exit(0);
}

const raw = await readStdin(processStdin);
const grok = parseJson(raw);
const codexPayload = grok === null ? {} : mapGrokHookInputToCodex(grok);

// For malformed test: if parse failed, exit non-zero immediately (aligns with fixture CLI exit 1 for T7 strict JSON)
if (grok === null && raw.trim().length > 0) {
  console.error("T7-OMO-HOOK-ERROR: malformed JSON payload");
  process.exit(1);
}

// T7: Grok-compatible OMO hook parity routing. Strict JSON parsing; payload text is data, never shell.
// If command shape is `omo hook <event>`, route through existing component/runtime (ultrawork/rules dist/cli.js).
// Bridge now explicitly supports OMO component entrypoint invocation for native Grok hooks.

const pluginRoot = process.env.GROK_PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? "";
const pluginData = process.env.GROK_PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? "";

const childEnv = { ...process.env };
if (pluginRoot.length > 0) {
  childEnv.PLUGIN_ROOT = pluginRoot;
}
if (pluginData.length > 0) {
  childEnv.PLUGIN_DATA = pluginData;
}

const [executable, ...childArgs] = args;
const bridgeStartMs = Date.now();
let bridgeStdout = "";
let bridgeStderr = "";
const exitCode = await new Promise((resolve) => {
  const child = spawn(executable, childArgs, {
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => { bridgeStdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { bridgeStderr += chunk.toString(); });
  child.stdin.on("error", () => {});
  child.stdin.write(`${JSON.stringify(codexPayload)}\n`);
  child.stdin.end();
  child.on("error", () => resolve(1));
  child.on("close", (code) => {
    // Capture child output for test assertions on malformed (stderr from fixture CLI)
    // Note: test helper already captures its own stdout/stderr; this pipes to test process
    if (bridgeStdout) process.stdout.write(bridgeStdout);
    if (bridgeStderr) process.stderr.write(bridgeStderr);
    resolve(code ?? 1);
  });
});

await devLog({
  event: codexPayload?.hook_event_name ?? "Unknown",
  hook: "bridge",
  source: "lfg-grok-hook-bridge",
  detail: {
    command: `${executable} ${childArgs.join(" ")}`,
    exitCode,
    durationMs: Date.now() - bridgeStartMs,
    stderrSnippet: bridgeStderr.length > 0 ? bridgeStderr.slice(0, 500) : null,
    stdoutSize: bridgeStdout.length,
  },
});

process.exit(exitCode);

function mapGrokHookInputToCodex(grok) {
  const event = normalizeHookEventName(grok);
  const sessionId = stringField(grok, ["sessionId", "session_id"]) ?? "grok-session";
  const cwd =
    stringField(grok, ["cwd", "workspaceRoot", "workspace_root", "CLAUDE_PROJECT_DIR"]) ??
    process.env.GROK_WORKSPACE_ROOT ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.cwd();
  const base = {
    session_id: sessionId,
    transcript_path: stringField(grok, ["transcriptPath", "transcript_path"]) ?? null,
    cwd,
    hook_event_name: event,
    model: stringField(grok, ["model"]) ?? "",
    permission_mode: stringField(grok, ["permissionMode", "permission_mode"]) ?? "",
  };

  switch (event) {
    case "SessionStart":
      return {
        ...base,
        source: mapSessionStartSource(grok),
      };
    case "UserPromptSubmit":
      return {
        ...base,
        turn_id: stringField(grok, ["turnId", "turn_id"]) ?? "",
        prompt: stringField(grok, ["prompt", "userQuery", "user_query"]) ?? "",
      };
    case "PostToolUse":
      return {
        ...base,
        turn_id: stringField(grok, ["turnId", "turn_id"]) ?? "",
        tool_name: mapToolName(stringField(grok, ["toolName", "tool_name"]) ?? ""),
        tool_input: grok.toolInput ?? grok.tool_input ?? {},
        tool_response: grok.toolResponse ?? grok.tool_response ?? grok.toolOutput ?? {},
        tool_use_id: stringField(grok, ["toolUseId", "tool_use_id"]) ?? "",
      };
    case "PostCompact":
      return {
        ...base,
        turn_id: stringField(grok, ["turnId", "turn_id"]) ?? "",
        trigger: grok.trigger === "manual" ? "manual" : "auto",
      };
    case "PreToolUse":
      return {
        ...base,
        turn_id: stringField(grok, ["turnId", "turn_id"]) ?? "",
        tool_name: mapToolName(stringField(grok, ["toolName", "tool_name"]) ?? ""),
        tool_input: grok.toolInput ?? grok.tool_input ?? {},
        tool_use_id: stringField(grok, ["toolUseId", "tool_use_id"]) ?? "",
      };
    case "Stop":
    case "SubagentStop":
      return {
        ...base,
        turn_id: stringField(grok, ["turnId", "turn_id"]) ?? "",
      };
    default:
      return { ...base, grok_payload: grok };
  }
}

function normalizeHookEventName(grok) {
  const fromEnv = process.env.GROK_HOOK_EVENT;
  const raw =
    stringField(grok, ["hookEventName", "hook_event_name", "hookEvent"]) ??
    (fromEnv && fromEnv.length > 0 ? fromEnv : "UserPromptSubmit");
  const snake = raw.includes("_") ? raw : camelToSnake(raw);
  const pascal = snake
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
  if (pascal === "Subagentend") {
    return "SubagentStop";
  }
  return pascal.length > 0 ? pascal : "UserPromptSubmit";
}

function mapSessionStartSource(grok) {
  const source = stringField(grok, ["source", "sessionSource"]);
  if (source === "resume" || source === "clear" || source === "compact" || source === "startup") {
    return source;
  }
  return "startup";
}

function mapToolName(name) {
  const aliases = {
    run_terminal_command: "Bash",
    read_file: "Read",
    search_replace: "Edit",
    write: "Write",
    grep: "Grep",
    list_dir: "Glob",
    spawn_subagent: "Task",
    web_search: "WebSearch",
  };
  return aliases[name] ?? name;
}

function stringField(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function camelToSnake(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function parseJson(raw) {
  // T7 strict JSON: malformed input rejected (non-zero exit in test helper); prompt_injection treated as data only.
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

async function readStdin(stream) {
  stream.setEncoding("utf8");
  let data = "";
  for await (const chunk of stream) {
    data += chunk;
  }
  return data;
}
