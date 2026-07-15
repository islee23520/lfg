#!/usr/bin/env node
import { execFile } from "node:child_process"
import { stdin as input, stdout as output } from "node:process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const AMBIGUITIES = new Set(["low", "med", "high"])
const ROUTES = new Set(["codex", "clarify", "chat", "git", "explore"])
const TRIVIAL = /^(hi|hello|hey|thanks|thank you|ok|okay|ㅎㅎ|ㅇㅇ|yes|no|yep|nope)\s*[.!?]?\s*$/i

export function shouldSkipGjcIntent(prompt) {
  return typeof prompt !== "string" || prompt.trim().length === 0 || TRIVIAL.test(prompt.trim())
}

export function parseGjcIntentOutput(stdout) {
  if (typeof stdout !== "string") return null
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of [...lines].reverse()) {
    const parsedJson = parseJsonClassification(line)
    if (parsedJson !== null) return parsedJson
    const fields = Object.fromEntries(
      line.split("|").map((part) => part.trim().split(/\s*=\s*/, 2)).filter((pair) => pair.length === 2),
    )
    const parsedLine = parseClassification(fields)
    if (parsedLine !== null) return parsedLine
  }
  return null
}

export function buildGjcIntentContext(result) {
  const status = typeof result?.status === "string" ? result.status : "malformed"
  const classification = result?.classification ?? null
  const intent = typeof classification?.intent === "string" ? classification.intent : "unknown"
  const ambiguity = AMBIGUITIES.has(classification?.ambiguity) ? classification.ambiguity : "high"
  const route = ROUTES.has(classification?.route) ? classification.route : "clarify"
  const refinedFocus = typeof classification?.refinedFocus === "string" ? classification.refinedFocus : ""
  return [
    `<lfg-gjc-intent-gateway status="${escapeAttribute(status)}" intent="${escapeAttribute(intent)}" ambiguity="${ambiguity}" route="${route}">`,
    `Classification: ${JSON.stringify({ status, intent, ambiguity, route, refined_focus: refinedFocus || undefined })}`,
    status === "classified" ? "gjc classification is advisory." : `gjc gateway fail-open: ${status}; continue with Grok CEO judgment.`,
    ambiguity === "high" ? "CEO rule: ambiguity high — ask clarify first before handoff." : "CEO rule: refine the focus before routing.",
    route === "codex" ? "Route implementation through the Codex app-server handoff plan engine gpt." : `Honor route ${route}; do not force implementation.`,
    "Never use gjc as product implementer; gjc is intent/ambiguity classification only.",
    "Never spawn in-host lazycodex implementer; product implementation remains Codex app-server only.",
    "</lfg-gjc-intent-gateway>",
  ].join("\n")
}

async function main() {
  const payload = await readPayload()
  const prompt = firstString(payload, ["prompt", "userQuery", "user_query", "message"]) ?? ""
  if (shouldSkipGjcIntent(prompt)) return
  const result = await classifyWithGjc(prompt)
  output.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: buildGjcIntentContext(result),
    },
    statusMessage: `LFG: gjc intent gateway ${result.status}`,
  })}\n`)
}

async function classifyWithGjc(prompt) {
  const classifyPrompt = [
    "Classify this user request. Return ONE JSON line only.",
    'Schema: {"intent":"short label","ambiguity":"low|med|high","route":"codex|clarify|chat|git|explore","refined_focus":"optional short focus"}',
    "gjc is only an intent gateway; do not solve or implement the request.",
    `Request: ${prompt.replace(/\s+/g, " ").slice(0, 1600)}`,
  ].join("\n")
  try {
    const result = await execFileAsync("gjc", [
      "-p",
      "--mode", "text",
      "--no-tools",
      "--no-skills",
      "--no-session",
      "--thinking", "low",
      classifyPrompt,
    ], {
      encoding: "utf8",
      timeout: resolveTimeoutMs(),
      maxBuffer: 256 * 1024,
    })
    const classification = parseGjcIntentOutput(result.stdout)
    return classification === null ? { status: "malformed" } : { status: "classified", classification }
  } catch (error) {
    if (isMissingExecutable(error)) return { status: "missing" }
    if (isTimeout(error)) return { status: "timeout" }
    return { status: "error" }
  }
}

function parseJsonClassification(line) {
  try {
    return parseClassification(JSON.parse(line))
  } catch {
    return null
  }
}

function parseClassification(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const intent = typeof value.intent === "string" ? value.intent.trim() : ""
  const ambiguity = value.ambiguity
  const route = value.route
  if (intent.length === 0 || !AMBIGUITIES.has(ambiguity) || !ROUTES.has(route)) return null
  const refined = typeof value.refined_focus === "string" ? value.refined_focus.trim() : ""
  return refined.length === 0
    ? { intent, ambiguity, route }
    : { intent, ambiguity, route, refinedFocus: refined }
}

function resolveTimeoutMs() {
  const configured = Number.parseInt(process.env.LFG_GJC_INTENT_TIMEOUT_MS ?? "10000", 10)
  return Number.isFinite(configured) && configured > 0 ? configured : 10000
}

function isMissingExecutable(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT"
}

function isTimeout(error) {
  return typeof error === "object" && error !== null && (error.killed === true || error.code === "ETIMEDOUT")
}

function escapeAttribute(value) {
  return String(value).replace(/[&"<>]/g, (character) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[character])
}

function firstString(record, keys) {
  if (typeof record !== "object" || record === null) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

async function readPayload() {
  const raw = await new Promise((resolve, reject) => {
    const chunks = []
    input.on("data", (chunk) => chunks.push(chunk))
    input.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    input.on("error", reject)
  })
  try {
    return raw.trim().length === 0 ? {} : JSON.parse(raw)
  } catch {
    return {}
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => process.exit(0))
}
