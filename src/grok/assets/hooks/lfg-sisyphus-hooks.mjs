#!/usr/bin/env node
/**
 * lfg-sisyphus-hooks.mjs
 *
 * Grok-native first-party Sisyphus orchestration hook handler.
 * Injects orchestrator context into key lifecycle events WITHOUT the bridge chain.
 * Optimized for Grok Build: reads Grok env vars directly, emits hookSpecificOutput.
 */

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

function subagentStopContext() {
  const lines = [
    "<sisyphus-delegation-result>",
    "Subagent completed. Before proceeding:",
    "- Collect the result via get_command_or_subagent_output or the subagent return value.",
    "- For Grok todo continuation, store the subagent id and use resume_from for follow-up turns instead of Codex task(task_id=ses_...).",
    "- Verify: does the result match expected outcome?",
    "- Does it follow existing codebase patterns?",
    "- Did the agent follow MUST DO and MUST NOT DO requirements?",
    "- If verification failed -> resume the completed subagent with specific fix context or spawn a smaller follow-up.",
    "- This is todo/delegation continuation guidance only; start-work-continuation remains Deferred and is not automatic Stop/SubagentStop reinjection.",
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
    "Compaction imminent. Preserve Grok todo continuation state:",
    "- Todo list from todo_write (current item + remaining items)",
    "- Active plan / work breakdown",
    "- .omo/boulder.json and ledger state",
    "- Pending background task IDs for get_command_or_subagent_output / wait_commands_or_subagents",
    "- Subagent IDs and resume_from targets for follow-up turns",
    "- Scheduler or /loop task IDs that may re-enter this workflow",
    "- OMO continuation session IDs (ses_...) only as legacy/upstream evidence; map them to Grok subagent ids/resume_from when possible",
    "- Do not confuse todo continuation with start-work-continuation; the latter uses boulder-state getStopHookContinuationContext (ledger-backed path, no auto-reinjection; status Deferred).",
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
