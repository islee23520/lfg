#!/usr/bin/env node
/**
 * lfg-sisyphus-hooks.mjs
 *
 * Grok-native first-party Sisyphus orchestration hook handler.
 * Injects orchestrator context into key lifecycle events WITHOUT the bridge chain.
 * Optimized for Grok Build: reads Grok env vars directly, emits hookSpecificOutput.
 *
 * T3: SubagentStop also runs the pure .omo/evidence verifier (verifySubagentStopEvidence)
 * for coding|hephaestus|builder — same markers as src/grok/hooks/subagent-stop-evidence-verifier.ts.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const { devLog } = await importFirst(["./lfg-dev-logger.mjs", "../log/lfg-dev-logger.mjs"]);

const MODEL_EXPLICIT_NO_VISION = [
  /non-reasoning/,
  /grok-composer/,
  /grok-3-mini/,
  /grok-build/,
  /codex-auto/,
  /embedding/,
  /imagine-image/,
  /imagine-video/,
  /tts/,
  /whisper/,
];

const MODEL_EXPLICIT_VISION = [
  /gemini/,
  /gpt-5/,
  /gpt-4o/,
  /gpt-4\.1/,
  /vision/,
  /glm-4\.6v/,
  /kimi-k2\.6/,
  /multimodal/,
];

async function main() {
  const raw = await readStdin();
  const input = parseJson(raw);
  // Fail-closed pure evidence verifier when SubagentStop stdin is not valid JSON.
  if (input === null && typeof raw === "string" && raw.trim().length > 0) {
    const envEvent = process.env.GROK_HOOK_EVENT ?? "";
    if (/subagentstop/i.test(envEvent.replace(/[_-]/g, ""))) {
      const pure = verifySubagentStopEvidence(raw, process.cwd());
      const body =
        pure.additionalContext ??
        pure.warning ??
        "ERROR: Evidence verifier fail-closed on malformed JSON payload";
      process.stdout.write(
        JSON.stringify({
          statusMessage: "Sisyphus: SubagentStop evidence verifier fail-closed",
          hookSpecificOutput: { hookEventName: "SubagentStop", additionalContext: body },
        }) + "\n",
      );
      return;
    }
  }
  await runHook(input);
}

async function runHook(input) {
  const event = normalizeHookEventName(input);
  let context;
  try {
    context = renderSisyphusContext(event, input);
  } catch (error) {
    await devLog({ event, hook: "sisyphus", level: "error", detail: { failClosed: true, message: String(error?.message ?? error) } }).catch(() => {});
    process.stdout.write(JSON.stringify({ statusMessage: `Sisyphus: ${event} (fail-closed, no injection)` }) + "\n");
    return;
  }

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
}

const BOULDER_MAX_BYTES = 128 * 1024;
const PLAN_MAX_BYTES = 256 * 1024;

function projectRootFromInput(record) {
  return stringField(record ?? {}, ["cwd"]) ?? stringField(record ?? {}, ["workspaceRoot"]) ?? stringField(record ?? {}, ["workspace_root"]) ?? process.env.GROK_WORKSPACE_ROOT ?? process.cwd();
}

function readActiveWorkSnapshot(projectRoot) {
  try {
    const boulderPath = join(projectRoot, ".omo", "boulder.json");
    if (!existsSync(boulderPath)) return null;
    const st = statSync(boulderPath);
    if (st.size > BOULDER_MAX_BYTES) return null;
    const raw = readFileSync(boulderPath, "utf8");
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    // Try active_work_id -> works[id], else fall back to legacy mirror fields
    let work = null;
    let workId = null;
    if (typeof data.active_work_id === "string" && data.works && typeof data.works === "object") {
      work = data.works[data.active_work_id] ?? null;
      workId = data.active_work_id;
    }
    if (!work) {
      // Legacy mirror: top-level fields
      work = data;
      workId = data.work_id ?? data.active_work_id ?? "unknown";
    }
    return {
      workId: String(workId),
      planName: typeof work.plan_name === "string" ? work.plan_name : "",
      status: typeof work.status === "string" ? work.status : "unknown",
      activePlan: typeof work.active_plan === "string" ? work.active_plan : null,
      worktreePath: typeof work.worktree_path === "string" ? work.worktree_path : null,
      sessionCount: Array.isArray(work.session_ids) ? work.session_ids.length : 0,
    };
  } catch { return null; }
}

function readPlanChecklist(planPath) {
  try {
    if (!planPath || !existsSync(planPath)) return null;
    const st = statSync(planPath);
    if (st.size > PLAN_MAX_BYTES) return null;
    const raw = readFileSync(planPath, "utf8");
    const lines = raw.split("\n");
    // Port of plan-checklist.ts: only ## TODOs and ## Final Verification Wave count
    const TODO_HEADING = /^##\s+TODOs\b/i;
    const FINAL_HEADING = /^##\s+Final Verification Wave\b/i;
    const SECTION_PATTERN = /^##\s+/;
    const CHECKED = /^- \[[xX]\] /;
    const UNCHECKED = /^- \[ \] /;
    const hasCountedSections = lines.some(l => TODO_HEADING.test(l) || FINAL_HEADING.test(l));
    let isCountedSection = !hasCountedSections; // verbatim from TS source
    let total = 0, completed = 0;
    let nextTaskLabel = null;
    for (const line of lines) {
      if (SECTION_PATTERN.test(line)) {
        isCountedSection = TODO_HEADING.test(line) || FINAL_HEADING.test(line) || (!hasCountedSections);
        continue;
      }
      if (CHECKED.test(line) || UNCHECKED.test(line)) {
        if (isCountedSection) {
          total++;
          if (CHECKED.test(line)) completed++;
          else if (nextTaskLabel === null) nextTaskLabel = line.replace(UNCHECKED, "").trim();
        }
      }
    }
    return { total, completed, remaining: total - completed, nextTaskLabel };
  } catch { return null; }
}

function readUlwLoopSessionCount(projectRoot) {
  try {
    const dir = join(projectRoot, ".omo", "ulw-loop");
    if (!existsSync(dir)) return 0;
    const entries = readdirSync(dir);
    return entries.filter(e => /^[0-9a-f-]{8,}$/i.test(e)).length;
  } catch { return 0; }
}

function resolvePlanPath(projectRoot, activePlan) {
  if (!activePlan) return null;
  try { return resolve(projectRoot, ".omo", "plans", activePlan); } catch { return null; }
}

function sanitizeBoulderField(value, maxLen = 120) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, maxLen);
  if (/secret|password|api[_-]?key|token|credential/i.test(cleaned)) return "[redacted]";
  return cleaned;
}

function renderDurableStateBlock(projectRoot) {
  const snap = readActiveWorkSnapshot(projectRoot);
  if (!snap) return "";
  const lines = ["<sisyphus-durable-state>"];
  lines.push(`Active work: ${sanitizeBoulderField(snap.workId)}`);
  const planPath = resolvePlanPath(projectRoot, snap.activePlan);
  if (planPath) {
    lines.push(`Plan path: ${planPath}`);
    const checklist = readPlanChecklist(planPath);
    if (checklist) {
      lines.push(`Checklist: ${checklist.completed}/${checklist.total} done, ${checklist.remaining} remaining (next: ${checklist.nextTaskLabel || "none"})`);
    }
  }
  const ulwCount = readUlwLoopSessionCount(projectRoot);
  if (ulwCount > 0) lines.push(`ULW-Loop sessions: ${ulwCount}`);
  lines.push("Orchestrator mode: still active — re-assert Sisyphus orchestration discipline after compaction.");
  lines.push("</sisyphus-durable-state>");
  return lines.join("\n");
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
      return subagentStopContext(input);
    case "SubagentStart":
      return subagentStartContext();
    case "Stop":
      return stopContext();
    case "PreCompact":
      return preCompactContext(input);
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
  const planningIntent = detectPlanningIntent(prompt);
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
  ];
  if (planningIntent !== null) {
    lines.push("", planningRoutingBlock(planningIntent));
  }
  const projectRoot = projectRootFromInput(input);
  const snap = readActiveWorkSnapshot(projectRoot);
  if (snap) {
    lines.push("");
    lines.push("<active-work>");
    lines.push(`Active boulder work: ${sanitizeBoulderField(snap.workId)} (${sanitizeBoulderField(snap.planName)}, status=${sanitizeBoulderField(snap.status)}).`);
    const planPath = resolvePlanPath(projectRoot, snap.activePlan);
    if (planPath) lines.push(`Plan: ${planPath}`);
    lines.push("Resume via boulder-state; continuation CLI remains Deferred.");
    lines.push("</active-work>");
  }
  lines.push("", "</sisyphus-intent-routing>");
  return { statusLabel: planningIntent !== null ? "Planning intent routed to /ulw-plan" : "Intent routing hints injected", body: lines.join("\n") };
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

function verifySubagentEvidence(input) {
  const text = typeof input === "string"
    ? input
    : (input && typeof input === "object")
      ? JSON.stringify(input)
      : "";
  const missing = [];
  const weak = [];
  const hasEvidence = /test|vitest|jest|npm run|exit code|passed|failed/i.test(text);
  const hasFile = /src\/|\.ts|\.js|\.mjs|\.md/i.test(text);
  if (!hasEvidence) missing.push("test-run-evidence");
  if (!hasFile) missing.push("changed-file-reference");
  if (hasEvidence && !/pass|green|0 exit/i.test(text)) weak.push("tests-not-confirmed-green");
  if (missing.length > 0) return { status: "missing_evidence", missing, weak };
  if (weak.length > 0) return { status: "weak_evidence", missing, weak };
  return { status: "verified", missing, weak };
}

/**
 * Pure .omo/evidence SubagentStop verifier (Grok MVP).
 * Mirrors src/grok/hooks/subagent-stop-evidence-verifier.ts so the installed
 * Sisyphus SubagentStop path can emit the same WARNING/VERIFIED/fail-closed markers.
 */
function verifySubagentStopEvidence(payload, cwd = process.cwd()) {
  try {
    const input = parseSubagentStopEvidenceInput(payload);
    if (!input) {
      return {
        hasReceipt: true,
        additionalContext: "Not a SubagentStop payload or non-target agent (MVP verifier silent)",
      };
    }

    const targetGrokAgents = ["coding", "hephaestus", "builder"];
    const isTarget = targetGrokAgents.some((agent) => input.agentName.toLowerCase().includes(agent));

    if (!isTarget) {
      return {
        hasReceipt: true,
        additionalContext: `SubagentStop for non-target Grok agent "${input.agentName}" — evidence check skipped (MVP)`,
      };
    }

    const evidenceRoot = resolve(cwd, ".omo", "evidence");
    const hasReceipt = hasValidEvidenceReceipt(evidenceRoot, cwd);

    if (hasReceipt) {
      return {
        hasReceipt: true,
        additionalContext: `Evidence receipt VERIFIED for Grok agent "${input.agentName}" in .omo/evidence (MVP SubagentStop verifier). Continue with next todo or checkpoint.`,
      };
    }

    const warning = renderEvidenceWarning(input.agentName, evidenceRoot);
    return {
      hasReceipt: false,
      warning,
      additionalContext: warning,
    };
  } catch (error) {
    const msg = `Grok SubagentStop evidence verifier: ${error instanceof Error ? error.message : String(error)}`;
    console.error(msg);
    return {
      hasReceipt: false,
      warning: msg,
      additionalContext:
        "ERROR: " +
        msg +
        "\n\nEvidence verifier fail-closed on malformed payload (matches comment-checker pattern). Fix JSON shape before retry.",
    };
  }
}

function parseSubagentStopEvidenceInput(payload) {
  let record;
  if (typeof payload === "string") {
    try {
      const trimmed = payload.trim();
      if (!trimmed) return null;
      const parsed = JSON.parse(trimmed);
      if (!isPlainRecord(parsed)) return null;
      record = parsed;
    } catch {
      throw new Error("malformed JSON payload");
    }
  } else if (isPlainRecord(payload)) {
    record = payload;
  } else {
    throw new Error("payload must be object or valid JSON string");
  }

  const event =
    evidenceStringField(record, ["hookEventName", "hook_event_name", "event", "type"]) ?? "";
  if (!event.toLowerCase().includes("subagentstop") && !event.toLowerCase().includes("stop")) {
    return null;
  }

  const agentName =
    evidenceStringField(record, [
      "agentName",
      "agent_name",
      "agent",
      "subagent.name",
      "subagentName",
      "subagent_name",
    ]) ||
    evidenceStringField(isPlainRecord(record.subagent) ? record.subagent : {}, ["name", "type", "id"]) ||
    evidenceStringField(isPlainRecord(record.result) ? record.result : {}, ["agent", "name"]) ||
    "unknown";

  const lastMessage =
    evidenceStringField(record, [
      "last_assistant_message",
      "lastAssistantMessage",
      "last_message",
      "transcript",
      "output",
      "result",
    ]) ?? "";

  return {
    agentName,
    lastMessage: lastMessage || undefined,
    cwd: evidenceStringField(record, ["cwd", "workspaceRoot", "workspace_root"]) ?? process.cwd(),
  };
}

function hasValidEvidenceReceipt(evidenceRoot, cwd) {
  if (!existsSync(evidenceRoot)) return false;
  try {
    const files = readdirSync(evidenceRoot);
    for (const file of files) {
      const fullPath = resolve(evidenceRoot, file);
      if (isNonEmptyEvidenceFile(fullPath, evidenceRoot, cwd)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isNonEmptyEvidenceFile(filePath, evidenceRoot, cwd) {
  if (!existsSync(filePath)) return false;
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return false;
    const lstat = lstatSync(filePath, { throwIfNoEntry: false });
    if (lstat?.isSymbolicLink()) return false;
    const relToEvidence = relative(evidenceRoot, filePath);
    const relToCwd = relative(cwd, filePath);
    if (relToEvidence.startsWith("..") || relToCwd.startsWith("..") || isAbsolute(relToEvidence)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function renderEvidenceWarning(agentName, evidenceRoot) {
  return (
    `WARNING: Grok SubagentStop evidence verifier (MVP) detected no receipt in ${evidenceRoot} for agent "${agentName}".\n` +
    `Target agents: coding, hephaestus, builder.\n` +
    `Please write concrete evidence (e.g. task-7-*.txt with build/test/output verification) before completion.\n` +
    `This enforces OMO-style evidence discipline in GrokBuild via additionalContext. See .omo/evidence/task-7-lfg-next-release-app-server-epic.txt`
  );
}

function evidenceStringField(record, keys) {
  if (!isPlainRecord(record)) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (key.includes(".")) {
      const [parent, child] = key.split(".");
      const parentObj = record[parent];
      if (isPlainRecord(parentObj)) {
        const childVal = parentObj[child];
        if (typeof childVal === "string" && childVal.length > 0) return childVal;
      }
    }
  }
  return "";
}

function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function subagentStopContext(input) {
  const evidence = verifySubagentEvidence(input);
  const lines = [
    "<sisyphus-delegation-result>",
    "Subagent completed. Before proceeding:",
    "- Collect the result via get_command_or_subagent_output or the subagent return value.",
    "- For Grok todo continuation, store the subagent id and use resume_from for follow-up turns instead of Codex task(task_id=ses_...).",
    "- Verify: does the result match expected outcome?",
    "- Does it follow existing codebase patterns?",
    "- Did the agent follow MUST DO and MUST NOT DO requirements?",
    "- If verification failed -> resume the completed subagent with specific fix context or spawn a smaller follow-up.",
    "- Evidence verification: " + evidence.status + ".",
  ];
  if (evidence.status === "missing_evidence") {
    lines.push("  Missing: " + evidence.missing.join(", ") + ".");
    lines.push("  Resume the subagent with specific evidence requests before proceeding.");
  } else if (evidence.status === "weak_evidence") {
    lines.push("  Weak: " + evidence.weak.join(", ") + ".");
    lines.push("  Consider requesting stronger proof from the subagent.");
  }

  // T3: pure .omo/evidence verifier for coding|hephaestus|builder (MVP, additionalContext).
  const cwd =
    (isPlainRecord(input)
      ? stringField(input, ["cwd", "workspaceRoot", "workspace_root"])
      : null) ?? process.cwd();
  const pure = verifySubagentStopEvidence(input ?? {}, cwd);
  if (pure.additionalContext) {
    lines.push("", "<sisyphus-omo-evidence-verifier>", pure.additionalContext, "</sisyphus-omo-evidence-verifier>");
  }

  lines.push("- For durable continuation across sessions, use `lfg ulw-loop` to checkpoint and resume work.");
  lines.push("</sisyphus-delegation-result>");
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
    "- For durable continuation across sessions, use `lfg ulw-loop` (or `lfg ulw`) to checkpoint and resume; no automatic reinjection (start-work-continuation remains Deferred).",
    "",
    "</sisyphus-final-review-gate>",
  ];
  return { statusLabel: "Final review gate", body: lines.join("\n") };
}

function preCompactContext(input) {
  const lines = [
    "<sisyphus-state-preservation>",
    "Compaction imminent. Preserve Grok todo continuation state:",
    "- Todo list from todo_write (current item + remaining items)",
    "- Active plan / work breakdown",
    "- .omo/boulder.json and ledger state",
    "- Pending background task IDs for get_command_or_subagent_output / wait_commands_or_subagents",
    "- Subagent IDs and resume_from targets for follow-up turns",
    "- Scheduler or /loop task IDs that may re-enter this workflow",
    "- OMO continuation session IDs (ses_...) only as legacy/upstream evidence; map them to Grok subagent ids/resume_from when possible",
    "- Do not confuse todo continuation with start-work-continuation; the latter uses boulder-state getStopHookContinuationContext (ledger-backed path, no auto-reinjection; start-work-continuation remains Deferred).",
    "",
    "</sisyphus-state-preservation>",
  ];
  const projectRoot = projectRootFromInput(input);
  const durableBlock = renderDurableStateBlock(projectRoot);
  if (durableBlock) lines.push("", durableBlock);
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

/**
 * Detect planning-intent signals that should route through OMO /ulw-plan discipline
 * (Prometheus planner + Metis/Momus verification gates) rather than Grok's native
 * plan mode which bypasses OMO planning workflow.
 *
 * Returns a planning-intent kind string ("plan-request", "ambiguous-scope", or
 * "architecture-decision") when detected, or null when the prompt is clearly
 * execution/research/fix and does not need the /ulw-plan gate.
 */
function detectPlanningIntent(prompt) {
  if (prompt.length === 0) return null;

  // Explicit planning-artifact requests — the user is asking to produce a plan,
  // roadmap, blueprint, or strategy. These are always /ulw-plan territory even
  // when paired with "create"/"write"/"build" — the verb acts on the planning
  // artifact itself, not on code. Only suppress when the prompt is clearly code
  // execution referencing an existing plan as a spec: "implement the plan".
  if (
    /\b(plan|planning|blueprint|roadmap|strategy|design\s+(the|an?)\s+(approach|architecture|system|solution))\b/i.test(prompt) &&
    !/\b(implement|code)\s+(the\s+|this\s+|that\s+|our\s+)?plan\b/i.test(prompt)
  ) {
    return "plan-request";
  }

  // Ambiguous/large scope that OMO /ulw-plan classifies as needing a plan:
  // "make it better", "figure out what to build", "just make it good",
  // multi-module refactors, architecture decisions, vague briefs.
  const ambiguousPhrases = [
    /\bmake\s+it\s+(better|good|work|fast)\b/i,
    /\bfigure\s+out\s+what\s+to\b/i,
    /\bvague\b/i,
    /\bambiguous\b/i,
  ];
  for (const pattern of ambiguousPhrases) {
    if (pattern.test(prompt)) return "ambiguous-scope";
  }

  // Architecture / multi-module decisions — these need Prometheus planning
  // discipline: "redesign the auth system", "restructure the database",
  // "migrate from X to Y".
  if (/\b(redesign|restructure|migrate|overhaul|rewrite|refactor\s+(the|an?)\s+\w+\s+(system|module|service|layer|pipeline))\b/i.test(prompt)) {
    return "architecture-decision";
  }

  // Multi-step briefs that name architecture decisions.
  if (/\b(architecture|system design|api design|data model|schema design)\b/i.test(prompt)) {
    return "architecture-decision";
  }

  return null;
}

/** Render the /ulw-plan routing block for the detected planning intent kind. */
function planningRoutingBlock(intentKind) {
  const kindLabel = intentKind === "plan-request"
    ? "explicit planning request"
    : intentKind === "ambiguous-scope"
      ? "ambiguous/vague scope"
      : "architecture/multi-module decision";

  return [
    `<sisyphus-planning-routing kind="${intentKind}">`,
    `PLANNING INTENT DETECTED (${kindLabel}).`,
    "",
    "Route through OMO /ulw-plan discipline instead of Grok native plan mode:",
    "- Invoke /ulw-plan to activate Prometheus (explore-first planning consultant).",
    "- Prometheus explores the codebase, asks only the forks exploration cannot resolve,",
    "  writes ONE decision-complete plan under .omo/plans/, and waits for explicit approval.",
    "- Metis (gap analysis) and Momus (high-accuracy review) gates verify the plan before execution.",
    "- Do NOT bypass /ulw-plan with Grok's built-in enter_plan_mode for this request.",
    "",
    "/ulw-plan classification:",
    "- CLEAR (outcome known, only tradeoffs open): ask surviving forks, run approval gate.",
    "- UNCLEAR (outcome fuzzy): research maximally, adopt best-practice defaults, auto-run Momus review.",
    "- ON THE FENCE: treat as CLEAR, ask exactly ONE question.",
    "",
    "After /ulw-plan produces an approved plan, execution begins via $start-work or delegation.",
    "</sisyphus-planning-routing>",
  ].join("\n");
}

/**
 * Detect when the user prompt includes image attachments (or image placeholders)
 * but the active session model cannot accept image inputs. In that case Sisyphus
 * must force-delegate to multimodal-looker via spawn_subagent so the main turn
 * never hits the "Image inputs are not supported" 400 error.
 */
function detectImageDelegationNeed(input, prompt) {
  const hasImages = promptHasImageAttachments(input, prompt);
  if (!hasImages) return null;

  const model = stringField(input ?? {}, ["model"]) ?? stringField(process.env, ["GROK_MODEL", "GROK_DEFAULT_MODEL"]) ?? "";
  if (modelSupportsImageInputs(model)) return null;

  const modelNote = model.length > 0 ? model.replace(/[\r\n<>]/g, " ").slice(0, 80) : "current session default";
  const lines = [
    "<sisyphus-image-delegation>",
    `IMAGE ATTACHMENTS DETECTED — main model (${modelNote}) does not support images.`,
    "The orchestrator MUST delegate visual inspection immediately to prevent API 400.",
    "",
    "FORCED DELEGATION (execute this BEFORE any other work):",
    "1. Call: spawn_subagent({ subagent_type: \"multimodal-looker\", background: false, prompt: <user goal + image refs> })",
    "2. Prompt for the subagent MUST include every [Image #N] token and/or filesystem image path from the user message.",
    "3. DO NOT call read_file on image paths yourself; multimodal-looker handles the visual read.",
    "4. Wait for subagent result (structured evidence). Only then synthesize the final answer.",
    "5. Never retry the same image-bearing prompt on the main model — it will fail.",
    "",
    "image_gen/image_edit are for CREATING art, not for READING user screenshots.",
    "</sisyphus-image-delegation>",
  ];
  return lines.join("\n");
}

function promptHasImageAttachments(record, promptText) {
  const count = numberField(record ?? {}, ["attachmentCount", "attachment_count", "imageCount", "image_count"]);
  if (count !== null && count > 0) return true;

  const hasImage = booleanField(record ?? {}, ["hasImages", "has_images", "hasImageAttachments", "has_image_attachments"]);
  if (hasImage === true) return true;

  for (const key of ["attachments", "images", "imageAttachments", "image_attachments"]) {
    const list = record?.[key];
    if (Array.isArray(list) && list.some((item) => isImageAttachment(item))) return true;
  }

  const p = promptText ?? stringField(record ?? {}, ["prompt", "userQuery", "user_query"]) ?? "";
  if (/\[Image\s*#\d+\]/i.test(p)) return true;
  if (/\b(data:image\/[a-z0-9.+-]+;base64,)/i.test(p)) return true;

  if (contentPartsHaveImages(record?.content)) return true;
  if (contentPartsHaveImages(record?.message)) return true;
  if (Array.isArray(record?.messages)) {
    for (const message of record.messages) {
      if (contentPartsHaveImages(message?.content)) return true;
    }
  }
  return false;
}

function contentPartsHaveImages(content) {
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (typeof part !== "object" || part === null) return false;
    const type = String(part.type ?? "").toLowerCase();
    if (type === "image" || type === "image_url" || type === "input_image") return true;
    if (part.image_url !== undefined || part.imageUrl !== undefined) return true;
    if (part.source !== undefined && typeof part.source === "object") {
      const media = String(part.source.media_type ?? part.source.mediaType ?? "").toLowerCase();
      if (media.startsWith("image/")) return true;
    }
    return false;
  });
}

function isImageAttachment(item) {
  if (typeof item === "string") {
    return /\.(png|jpe?g|gif|webp|bmp|heic|svg)(\?|$)/i.test(item) || item.startsWith("data:image/");
  }
  if (typeof item !== "object" || item === null) return false;
  const mime = String(item.mimeType ?? item.mime_type ?? item.contentType ?? item.content_type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const kind = String(item.type ?? item.kind ?? "").toLowerCase();
  if (kind === "image" || kind === "image_url") return true;
  const path = stringField(item, ["path", "filePath", "file_path", "url"]);
  if (path !== null && (/\.(png|jpe?g|gif|webp|bmp|heic|svg)(\?|$)/i.test(path) || path.startsWith("data:image/"))) {
    return true;
  }
  return false;
}

function numberField(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function booleanField(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value === true || value === false) return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function modelSupportsImageInputs(modelId) {
  const id = modelId.trim();
  if (id.length === 0) return false;
  const lower = id.toLowerCase();
  if (MODEL_EXPLICIT_NO_VISION.some((re) => re.test(lower))) return false;
  if (MODEL_EXPLICIT_VISION.some((re) => re.test(lower))) return true;
  if (/^xai\//i.test(id)) {
    const bare = id.replace(/^xai\//i, "");
    if (MODEL_EXPLICIT_NO_VISION.some((re) => re.test(bare))) return false;
    if (MODEL_EXPLICIT_VISION.some((re) => re.test(bare))) return true;
    if (/grok-4/i.test(bare) && !/non-reasoning|composer|mini/i.test(bare)) return true;
    return false;
  }
  if (/grok-4/i.test(lower) && !/non-reasoning|composer|mini/i.test(lower)) return true;
  return false;
}

function normalizeHookEventName(record) {
  const raw =
    stringField(record ?? {}, ["hookEventName", "hook_event_name"]) ??
    process.env.GROK_HOOK_EVENT ??
    "SessionStart";
  const snake = raw.includes("_") ? raw : raw.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return (
    snake
      .split(/[-_]/)
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

export {
  renderSisyphusContext,
  subagentStopContext,
  verifySubagentEvidence,
  verifySubagentStopEvidence,
  runHook,
};

const isMain = (() => {
  try {
    return process.argv[1] && (process.argv[1].endsWith("lfg-sisyphus-hooks.mjs") || process.argv[1].endsWith("sisyphus"));
  } catch {
    return false;
  }
})();
if (isMain) main();
