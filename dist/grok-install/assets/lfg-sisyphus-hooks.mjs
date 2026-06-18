#!/usr/bin/env node
/**
 * lfg-sisyphus-hooks.mjs
 *
 * Grok-native first-party Sisyphus orchestration hook handler.
 * Injects orchestrator context into key lifecycle events WITHOUT the bridge chain.
 * Optimized for Grok Build: reads Grok env vars directly, emits hookSpecificOutput.
 */

import { devLog } from "./lfg-dev-logger.mjs";

const input = parseJson(await readStdin());
const event = normalizeHookEventName(input);
const context = renderSisyphusContext(event, input);

await devLog({
  event,
  hook: "sisyphus",
  agent: "sisyphus",
  cwd: stringField(input ?? {}, ["cwd", "workspaceRoot"]),
  detail: {
    contextInjected: context !== null,
    statusLabel: context?.statusLabel ?? null,
    prompt: event === "UserPromptSubmit" ? (stringField(input ?? {}, ["prompt"])?.slice(0, 200) ?? null) : null,
    toolName: stringField(input ?? {}, ["toolName", "tool_name"]),
  },
});

if (context !== null) {
  const statusMessage = `Sisyphus: ${context.statusLabel}`;
  process.stdout.write(
    JSON.stringify({
      statusMessage,
      hookSpecificOutput: { hookEventName: event, additionalContext: context.body },
    }) + "\n",
  );
} else {
  process.stdout.write(JSON.stringify({ statusMessage: `Sisyphus: ${event} (no injection)` }) + "\n");
}

function renderSisyphusContext(event, input) {
  switch (event) {
    case "SessionStart":
      return sessionStartContext();
    case "UserPromptSubmit":
      return userPromptSubmitContext(input);
    case "PreToolUse":
      return preToolUseContext(input);
    case "PostToolUse":
      return postToolUseContext(input);
    case "SubagentStop":
      return subagentStopContext();
    case "SubagentStart":
      return subagentStartContext();
    case "Stop":
      return stopContext();
    case "PreCompact":
      return preCompactContext();
    case "Notification":
      return notificationContext(input);
    default:
      return null;
  }
}

function sessionStartContext() {
  const lines = [
    "<sisyphus-orchestrator-mode>",
    "Sisyphus orchestrator mode is active for this Grok Build session.",
    "",
    "Operating principles:",
    "- Parse intent before acting. Map surface form to true intent.",
    "- NEVER start implementing unless explicitly requested.",
    "- Create todos BEFORE starting non-trivial work.",
    "- Delegate to specialists: visual-engineering for UI, ultrabrain for hard logic, oracle for architecture.",
    "- Fire explore/librarian agents in PARALLEL for codebase/external research.",
    "- Collect ALL agent results before delivering final answer.",
    "- Verify with evidence: lsp_diagnostics, build, tests. NO EVIDENCE = NOT COMPLETE.",
    "",
    "</sisyphus-orchestrator-mode>",
  ];
  return { statusLabel: "Orchestrator mode initialized", body: lines.join("\n") };
}

function userPromptSubmitContext(input) {
  const prompt = stringField(input ?? {}, ["prompt", "userQuery", "user_query"]) ?? "";
  const intentHints = detectIntentHints(prompt);
  const lines = [
    "<sisyphus-intent-routing>",
    `User prompt received (${prompt.length} chars). Intent signals: ${intentHints.join(", ") || "none detected"}.`,
    "",
    "Routing reminders:",
    "- 'explain/how does' -> research: fire explore/librarian, synthesize, answer.",
    "- 'implement/add/create' -> implementation: plan -> delegate or execute.",
    "- 'look into/check/investigate' -> investigation: explore, report findings.",
    "- 'fix/broken/error' -> diagnose: find root cause, fix minimally.",
    "- Ambiguous scope -> ask ONE clarifying question before proceeding.",
    "",
    "</sisyphus-intent-routing>",
  ];
  return { statusLabel: "Intent routing hints injected", body: lines.join("\n") };
}

function preToolUseContext(input) {
  const toolName = stringField(input ?? {}, ["toolName", "tool_name"]) ?? "";
  const isEditTool = /^(edit|write|search_replace|multi_edit)$/i.test(toolName);
  const lines = [
    "<sisyphus-verification-gate>",
    `Pre-tool check for ${toolName || "unknown tool"}.`,
    isEditTool
      ? "File modification detected. After this change: run lsp_diagnostics on changed files. Never suppress types with 'as any' or '@ts-ignore'."
      : "No file modification. Proceed.",
    "",
    "</sisyphus-verification-gate>",
  ];
  return { statusLabel: `Verification gate (${toolName || "tool"})`, body: lines.join("\n") };
}

function postToolUseContext(input) {
  const toolName = stringField(input ?? {}, ["toolName", "tool_name"]) ?? "";
  const isEditTool = /^(edit|write|search_replace|multi_edit)$/i.test(toolName);
  const lines = [
    "<sisyphus-evidence-collection>",
    `Post-tool: ${toolName || "unknown tool"}.`,
    isEditTool
      ? "File changed. Mark todo completed ONLY after: lsp_diagnostics clean, build passes, test passes. Track in todo list immediately."
      : "Collect results. Update todo if this was a delegated task.",
    "",
    "</sisyphus-evidence-collection>",
  ];
  return { statusLabel: `Evidence collection (${toolName || "tool"})`, body: lines.join("\n") };
}

function subagentStopContext() {
  const lines = [
    "<sisyphus-delegation-result>",
    "Subagent completed. Before proceeding:",
    "- Collect the result via background_output or task return value.",
    "- Verify: does the result match expected outcome?",
    "- Does it follow existing codebase patterns?",
    "- Did the agent follow MUST DO and MUST NOT DO requirements?",
    "- If verification failed -> continue session with specific fix request.",
    "",
    "</sisyphus-delegation-result>",
  ];
  return { statusLabel: "Delegation result verification", body: lines.join("\n") };
}

function subagentStartContext() {
  const lines = [
    "<sisyphus-delegation-start>",
    "Subagent dispatched. Track this delegation in your todo list.",
    "Do NOT duplicate the delegated work yourself while waiting.",
    "End your response and wait for the <system-reminder> completion notification.",
    "",
    "</sisyphus-delegation-start>",
  ];
  return { statusLabel: "Delegation tracking started", body: lines.join("\n") };
}

function stopContext() {
  const lines = [
    "<sisyphus-final-review-gate>",
    "Stop requested. Before declaring complete:",
    "- All planned todo items marked done?",
    "- Diagnostics clean on changed files?",
    "- Build passes (if applicable)?",
    "- User's original request fully addressed?",
    "- If any check fails: fix issues, do NOT declare done.",
    "",
    "</sisyphus-final-review-gate>",
  ];
  return { statusLabel: "Final review gate", body: lines.join("\n") };
}

function preCompactContext() {
  const lines = [
    "<sisyphus-state-preservation>",
    "Compaction imminent. Preserve critical state:",
    "- Todo list (current item + remaining items)",
    "- Active plan / work breakdown",
    "- .omo/boulder.json and ledger state",
    "- Any pending background task IDs (bg_...)",
    "- Continuation session IDs (ses_...)",
    "",
    "</sisyphus-state-preservation>",
  ];
  return { statusLabel: "State preservation before compaction", body: lines.join("\n") };
}

function notificationContext(input) {
  const message = stringField(input ?? {}, ["message", "notification"]) ?? "";
  const isFallback = /fallback|retry|model.*(change|switch)/i.test(message);
  const lines = [
    "<sisyphus-notification>",
    isFallback
      ? "Model fallback/retry detected. Verify the fallback model's output quality is adequate before proceeding."
      : `Notification received: ${message || "unknown"}.`,
    "",
    "</sisyphus-notification>",
  ];
  return { statusLabel: "Notification processed", body: lines.join("\n") };
}

function detectIntentHints(prompt) {
  const hints = [];
  if (/\b(explain|how does|what is|how do)\b/i.test(prompt)) hints.push("research");
  if (/\b(implement|add|create|build|set up)\b/i.test(prompt)) hints.push("implementation");
  if (/\b(look into|check|investigate|find|where)\b/i.test(prompt)) hints.push("investigation");
  if (/\b(fix|broken|error|bug|wrong|fail)\b/i.test(prompt)) hints.push("fix");
  if (/\b(refactor|improve|clean|optimize)\b/i.test(prompt)) hints.push("refactor");
  if (/\b(review|audit|security)\b/i.test(prompt)) hints.push("review");
  return hints;
}

function normalizeHookEventName(record) {
  const raw =
    stringField(record ?? {}, ["hookEventName", "hook_event_name"]) ??
    process.env.GROK_HOOK_EVENT ??
    "SessionStart";
  const snake = raw.includes("_") ? raw : raw.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return (
    snake
      .split("_")
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("") || "SessionStart"
  );
}

function stringField(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
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
