#!/usr/bin/env node
import { readFileSync } from "node:fs";

/** GrokBuild-native marker (primary). */
const AUTO_WORKFLOW_MARKER = "<lfg-auto-workflow>";
/** Legacy marker from LazyCodex-era installs — still treated as "already injected". */
const LEGACY_AUTO_WORKFLOW_MARKER = "<lazycodex-auto-workflow>";
/** GrokBuild-native opt-in flag (primary). */
const AUTO_WORKFLOW_FLAG = "LFG_AUTO_WORKFLOW";
/** Legacy LazyCodex/OMO flag still accepted. */
const LEGACY_AUTO_WORKFLOW_FLAG = "OMO_CODEX_AUTO_WORKFLOW";
const TRANSCRIPT_SEARCH_BYTES = 512_000;
const CONTEXT_PRESSURE_MARKERS = [
  "context compacted",
  "context was compacted",
  "context_length_exceeded",
  "skill descriptions were shortened",
  "context_too_large",
  "codex ran out of room in the model's context window",
  "your input exceeds the context window",
  "long threads and multiple compactions",
];
const EXPLICIT_WORKFLOW_PATTERNS = [
  /\b(?:ultrawork|ulw)\b/i,
  /(?:^|\s)[/\$](?:init-deep|ulw-plan|start-work|ulw-loop)\b/i,
  /\b(?:lfg|omo)\s+ulw-loop\b/i,
];
const DEBUGGING_PROMPT_PATTERNS = [
  /\b(?:fix|debug|diagnose|investigate)\b[\s\S]{0,80}\b(?:bug|failure|failing|failed|flaky|regression|error|crash|ci|test|tests|build|typecheck)\b/i,
  /\b(?:bug|failure|failing|failed|flaky|regression|error|crash|ci|test|tests|build|typecheck)\b[\s\S]{0,80}\b(?:fix|debug|diagnose|investigate|why)\b/i,
  /\bwhy (?:is|are|did|does|do)\b[\s\S]{0,80}\b(?:broken|failing|failed|error|crash|regress|ci)\b/i,
];
const START_WORK_PROMPT_PATTERNS = [
  /\b(?:continue|resume|execute|start|run|work)\b[\s\S]{0,80}\b(?:approved|accepted|existing|current|ready)\b[\s\S]{0,80}\b(?:plan|workplan|prometheus plan)\b/i,
  /\b(?:approved|accepted|existing|current|ready)\b[\s\S]{0,80}\b(?:plan|workplan|prometheus plan)\b[\s\S]{0,80}\b(?:continue|resume|execute|start|run|work)\b/i,
];
const PLANNING_PROMPT_PATTERNS = [
  /\b(?:add|build|implement|create|ship)\b[\s\S]{0,100}\b(?:feature|page|screen|flow|integration|dashboard|service|api)\b/i,
  /\b(?:large|broad|complex|multi[- ]?file|cross[- ]?module|architecture|architectural)\b[\s\S]{0,100}\b(?:change|refactor|feature|migration|rewrite|cleanup)\b/i,
  /\b(?:refactor|restructure|redesign|modernize|migrate|rewrite)\b[\s\S]{0,100}\b(?:flow|module|system|package|architecture|codebase|auth|api)\b/i,
];
const WEAK_CONTEXT_PROMPT_PATTERNS = [
  /\b(?:new|unfamiliar|large|unknown)\b[\s\S]{0,80}\b(?:repo|repository|codebase|project)\b/i,
  /\b(?:onboard|understand|map|survey)\b[\s\S]{0,80}\b(?:repo|repository|codebase|project|architecture)\b/i,
];
const WORKFLOWS = [
  ["debugging or recovery work", DEBUGGING_PROMPT_PATTERNS, "- Treat this as debugging or recovery work.\n- Prefer the `/ulw-loop` / `lfg ulw-loop` verification loop before editing.\n- Preserve manual QA evidence for every claimed fix."],
  ["approved-plan continuation", START_WORK_PROMPT_PATTERNS, "- Treat this as approved-plan continuation work.\n- Prefer `/start-work` so execution follows the existing plan instead of replanning.\n- Preserve the plan's acceptance criteria and evidence requirements."],
  ["weak-context repository onboarding", WEAK_CONTEXT_PROMPT_PATTERNS, "- Treat this as weak-context repository onboarding.\n- Prefer `/init-deep` before broad implementation work.\n- If the repo is already mapped, continue with the existing project knowledge instead of remapping."],
  ["broad delivery work", PLANNING_PROMPT_PATTERNS, "- Treat this as broad delivery work.\n- Prefer `/ulw-plan` before implementation, then continue with `/start-work` when the plan is ready.\n- If the prompt is actually a tiny edit, keep it in plain GrokBuild instead."],
];

const raw = await readStdin();
const input = parseInput(raw);
const context = buildContext(input);
if (context !== null) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } }) + "\n");

function buildContext(input) {
  if (input === null || !isEnabled(process.env) || input.prompt.length === 0) return null;
  if (matchesAny(input.prompt, EXPLICIT_WORKFLOW_PATTERNS) || isContextPressure(input.prompt)) return null;
  if (hasMarkerInTranscript(input.transcriptPath) || isContextPressureTranscript(input.transcriptPath)) return null;
  const matches = WORKFLOWS.filter((workflow) => matchesAny(input.prompt, workflow[1]));
  if (matches.length === 0) return null;
  // Priority-first (WORKFLOWS order). Never re-ask the user to pick among known matches.
  const primary = matches[0];
  const also = matches.slice(1).map((workflow) => workflow[0]);
  const selection = also.length === 0
    ? primary[2]
    : `${primary[2]}\n- Also matched (${also.join(", ")}): keep primary above; do not ask the user which workflow — only drop to plain GrokBuild if the prompt is clearly a tiny edit.`;
  return `${AUTO_WORKFLOW_MARKER}\nLFG automatic workflow selection is enabled for this GrokBuild turn.\n\nSelection:\n${selection}\n</lfg-auto-workflow>`;
}

function parseInput(raw) {
  if (raw.trim().length === 0) return null;
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value) || !isUserPromptSubmit(value) || typeof value.prompt !== "string") return null;
    const transcriptPath = firstString(value, ["transcriptPath", "transcript_path"]);
    return { prompt: value.prompt, transcriptPath };
  } catch {
    return null;
  }
}

function isUserPromptSubmit(value) {
  return value.hookEventName === "UserPromptSubmit" || value.hook_event_name === "UserPromptSubmit";
}

function isEnabled(env) {
  return isTruthyFlag(env[AUTO_WORKFLOW_FLAG]) || isTruthyFlag(env[LEGACY_AUTO_WORKFLOW_FLAG]);
}

function isTruthyFlag(value) {
  return typeof value === "string" && /^(?:1|true|yes|on)$/i.test(value);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isContextPressure(text) {
  const normalized = text.toLowerCase();
  return CONTEXT_PRESSURE_MARKERS.some((marker) => normalized.includes(marker));
}

function hasMarkerInTranscript(path) {
  const transcript = readTranscript(path);
  return (
    transcript !== null &&
    (transcript.includes(AUTO_WORKFLOW_MARKER) || transcript.includes(LEGACY_AUTO_WORKFLOW_MARKER))
  );
}

function isContextPressureTranscript(path) {
  const transcript = readTranscript(path);
  return transcript !== null && isContextPressure(transcript);
}

function readTranscript(path) {
  if (path === null) return null;
  try {
    const rawTranscript = readFileSync(path);
    return rawTranscript.subarray(Math.max(0, rawTranscript.byteLength - TRANSCRIPT_SEARCH_BYTES)).toString("utf8");
  } catch {
    return null;
  }
}

function firstString(record, names) {
  for (const name of names) if (typeof record[name] === "string") return record[name];
  return null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.once("error", () => resolve(data));
    process.stdin.once("end", () => resolve(data));
  });
}
