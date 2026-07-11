#!/usr/bin/env node
import { readFileSync } from "node:fs";

const AUTO_WORKFLOW_MARKER = "<lazycodex-auto-workflow>";
const AUTO_WORKFLOW_FLAG = "OMO_CODEX_AUTO_WORKFLOW";
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
  /(?:^|\s)\$(?:init-deep|ulw-plan|start-work|ulw-loop)\b/i,
  /\bomo\s+ulw-loop\b/i,
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
  ["debugging or recovery work", DEBUGGING_PROMPT_PATTERNS, "- Treat this as debugging or recovery work.\n- Prefer the `$ulw-loop` / `omo ulw-loop` verification loop before editing.\n- Preserve manual QA evidence for every claimed fix."],
  ["approved-plan continuation", START_WORK_PROMPT_PATTERNS, "- Treat this as approved-plan continuation work.\n- Prefer `$start-work` so execution follows the existing plan instead of replanning.\n- Preserve the plan's acceptance criteria and evidence requirements."],
  ["weak-context repository onboarding", WEAK_CONTEXT_PROMPT_PATTERNS, "- Treat this as weak-context repository onboarding.\n- Prefer `$init-deep` before broad implementation work.\n- If the repo is already mapped, continue with the existing project knowledge instead of remapping."],
  ["broad delivery work", PLANNING_PROMPT_PATTERNS, "- Treat this as broad delivery work.\n- Prefer `$ulw-plan` before implementation, then continue with `$start-work` when the plan is ready.\n- If the prompt is actually a tiny edit, keep it in plain Codex instead."],
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
  const selection = matches.length === 1
    ? matches[0][2]
    : `- Several LazyCodex workflows may fit this prompt.\n- Ask one concise confirmation before escalating: ${matches.map((workflow) => workflow[0]).join(", ")}.\n- Keep the turn plain if the user confirms this is a small direct edit.`;
  return `${AUTO_WORKFLOW_MARKER}\nLazyCodex automatic workflow selection is enabled for this turn.\n\nSelection:\n${selection}\n</lazycodex-auto-workflow>`;
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
  const value = env[AUTO_WORKFLOW_FLAG];
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
  return transcript !== null && transcript.includes(AUTO_WORKFLOW_MARKER);
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
