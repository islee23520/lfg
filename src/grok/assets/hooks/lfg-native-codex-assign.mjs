#!/usr/bin/env node
/**
 * UserPromptSubmit: ALWAYS force Grok CEO → Codex handoff (not optional word-match).
 * Sisyphus must not do the work; LazyCodex/Codex must.
 */
import { stdin as input, stdout as output } from "node:process"

const WORK_INTENT = [
  { re: /\b(implement|add|create|build|set\s*up|write|code|patch|wire)\b/i, hint: "implementation" },
  { re: /\b(fix|broken|error|bug|wrong|fail|repair|green)\b/i, hint: "fix" },
  { re: /\b(refactor|improve|clean|optimize|delete|remove|strip|diet)\b/i, hint: "refactor" },
  { re: /\b(review|audit|security|adversarial|oracle)\b/i, hint: "review" },
  { re: /\b(test|vitest|verify|coverage)\b/i, hint: "verify" },
  { re: /\b(handoff|codex|lazycodex|delegate|external[\s-]?engine)\b/i, hint: "handoff" },
  { re: /\b(ulw|ultrawork|start-work|ulw-loop)\b/i, hint: "ulw" },
  { re: /\b(decide|decision|judgment|judge|should we|is it (done|safe|correct)|root cause|why|how (does|should)|analyze|analysis|verdict)\b/i, hint: "judgment" },
  { re: /\b(git|commit|rebase|blame|bisect|reflog|force-push|squash|fixup|branch|merge)\b/i, hint: "git" },
]

/** Chit-chat / pure meta that does not require Codex (still inject soft CEO rules). */
const SKIP_HANDOFF =
  /^(hi|hello|hey|thanks|thank you|ok|okay|ㅎㅎ|ㅇㅇ|yes|no|yep|nope)\s*[.!?]?\s*$/i

const IMAGE_INTENT =
  /\b(draw|imagegen|image gen|generate (an? )?image|mockup|illustration|diagram image|brand kit|logo concept|Imagine|그려|이미지 생성|그림)\b/i

async function main() {
  const raw = await readStdin()
  let payload = {}
  try {
    payload = raw.trim().length === 0 ? {} : JSON.parse(raw)
  } catch {
    process.exit(0)
  }

  const prompt = firstString(payload, ["prompt", "userQuery", "user_query", "message"]) ?? ""
  const hookEventName = firstString(payload, ["hookEventName", "hook_event_name"]) ?? "UserPromptSubmit"
  const body = /SessionStart/i.test(hookEventName) ? codexStartupContext() : buildCodexAssignContext(prompt)
  if (body === null) process.exit(0)

  output.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: `${sisyphusCeoProtocol()}\n${body}`,
      },
      statusMessage: "LFG: CEO must hand off to Codex (no self-implementation)",
    })}\n`,
  )
}

function sisyphusCeoProtocol() {
  return [
    '<lfg-sisyphus-ceo-protocol force="true">',
    "For every product ask: restate intent, craft a focused implementation brief, and hand off execution.",
    'Run: lfg --json handoff plan --role coding --engine gpt --focus "<intent + brief>"',
    "Launch handoff.launch.argv exactly as returned so Codex performs the work.",
    "Do not implement or independently certify the product result in Grok.",
    "Synthesize the user report only from the worker RESULT and its evidence.",
    '<lfg-sisyphus-low-nudge-policy mode="terminal-only">',
    "Assign once with a complete brief, then observe passively through status/poll/watch.",
    "NO MIDFLIGHT CODEX NUDGE: do not message the running worker for progress, reminders, status, corrections, or repeated instructions.",
    "Contact Codex again only after terminal RESULT or an explicit user scope change; consolidate any scope delta into one message.",
    "</lfg-sisyphus-low-nudge-policy>",
    "</lfg-sisyphus-ceo-protocol>",
  ].join("\n")
}

function codexStartupContext() {
  return [
    '<lfg-codex-startup force="true">',
    "Codex CLI is a required setup prerequisite and is assumed installed for this session.",
    'All product work MUST run: lfg --json handoff plan --role coding --engine gpt --focus "…"',
    "Launch the returned Codex argv. Never use an in-host implementer.",
    "LazyCodex is handoff-only: never probe, setup, install, or run Codex or lazycodex-ai.",
    "</lfg-codex-startup>",
  ].join("\n")
}

export function buildCodexAssignContext(prompt) {
  if (typeof prompt !== "string") return null
  const trimmed = prompt.trim()
  if (trimmed.length === 0) return null

  const focus = trimmed.replace(/\s+/g, " ").slice(0, 180).replace(/"/g, "'")
  if (IMAGE_INTENT.test(trimmed)) {
    const imagegenFocus = `HARD REQUIRE: load $imagegen and follow it for the real image deliverable. Save artifacts under project-relative paths and cite them in RESULT EVIDENCE. Do not use Grok-only image_gen tools. Task: ${focus}`
    return [
      '<lfg-codex-skill-assign force="true" skill="imagegen">',
      "FORCE HANDOFF — image generation work must run in Codex.",
      "HARD REQUIRE: the Codex worker MUST load `$imagegen` and follow it.",
      "Do not substitute ASCII or code-only pseudo-images when a real image is requested.",
      `Run: lfg --json handoff plan --role coding --engine gpt --focus "${imagegenFocus}"`,
      "Launch the returned Codex argv; do not use Grok-only image_gen tools or edit product files in Grok.",
      "Require project-relative artifact paths in RESULT EVIDENCE.",
      "</lfg-codex-skill-assign>",
    ].join("\n")
  }
  const goalIntent =
    /\/goal\b|\bgoal\s+(skill|clear|complete|set|update|create)\b|\bcreate_goal\b|\bupdate_goal\b|\bdurable\s+goal\b|\bultragoal\b/i.test(
      trimmed,
    )
  if (goalIntent) {
    return [
      '<lfg-codex-skill-assign force="true">',
      "FORCE HANDOFF — Intent: goal.",
      "Grok may touch the host /goal surface for set/clear display only.",
      "Grok MUST launch Codex for the goal WORK body.",
      `Prefer when available: lfg --json plan goal --focus "${focus}"`,
      `Fallback: lfg --json handoff plan --role coding --engine gpt --focus "goal: ${focus}"`,
      "The Codex worker MUST load $start-work when executing a plan, $ulw-loop for durable multi-goal work, or $ulw-plan for plan-only work.",
      "FORBIDDEN: Grok implementing under /goal alone.",
      "Launch the returned Codex argv; do not edit product files in Grok.",
      "</lfg-codex-skill-assign>",
    ].join("\n")
  }

  const startWorkIntent = /\b(start[\s-]?work|execute\s+plan|continue\s+plan|resume\s+plan)\b/i.test(trimmed)
  if (startWorkIntent) {
    const planPath = trimmed.match(/(?:\.omo\/plans\/|\/)[^\s"']+\.md\b/i)?.[0]
    const planArg = planPath ? ` --plan "${planPath.replace(/"/g, "'")}"` : ""
    return [
      '<lfg-codex-skill-assign force="true">',
      "FORCE HANDOFF — Grok must not execute start-work in-host.",
      `Run: lfg --json plan start-work --focus "${focus}"${planArg}`,
      "Prefer the Codex app-server transport; use codex-exec fallback only when the daemon is unavailable. The worker MUST load $start-work.",
      `If the plan start-work CLI is unavailable, run: lfg --json handoff plan --role coding --engine gpt --focus "start-work with $start-work: ${focus}"`,
      "Read .omo/external-engine/start-work-codex-skill-result.md before updating Boulder or reporting completion.",
      "Do not edit product files or run product QA in Grok.",
      "</lfg-codex-skill-assign>",
    ].join("\n")
  }

  const ulwPlanIntent = /\/ulw-plan\b|\bulw-plan\b|\bhyperplan\b|\bwrite\s+(a\s+)?plan\b/i.test(trimmed)
  if (ulwPlanIntent) {
    return [
      '<lfg-codex-plan-assign force="true" skill="ulw-plan">',
      "FORCE HANDOFF — Grok must not write the implementation plan in-host.",
      `Run: lfg --json plan ulw-plan --focus "${focus}"`,
      "Prefer the Codex app-server transport; use the codex-exec fallback only when the daemon is unavailable. The worker MUST load $ulw-plan.",
      "Do not edit product files in Grok.",
      "</lfg-codex-plan-assign>",
    ].join("\n")
  }

  const imageIntent = /\b(draw|image|illustrat|logo|picture|sprite|texture|mockup)\b/i.test(trimmed)
  if (imageIntent) {
    return [
      '<lfg-codex-skill-assign force="true" skill="imagegen">',
      "FORCE HANDOFF — Codex must load $imagegen for bitmap generation or editing.",
      `Run: lfg --json handoff plan --role coding --engine gpt --focus "${focus}"`,
      "Launch the returned Codex argv; Grok must not generate or edit the product asset in-host.",
      "</lfg-codex-skill-assign>",
    ].join("\n")
  }

  const hints = []
  for (const { re, hint } of WORK_INTENT) {
    if (re.test(trimmed) && !hints.includes(hint)) hints.push(hint)
  }

  // ALWAYS force handoff path for any non-trivial prompt (not only keyword hits).
  const trivial = SKIP_HANDOFF.test(trimmed) && trimmed.length < 40
  if (trivial && hints.length === 0) {
    return [
      "<lfg-codex-skill-assign>",
      "Grok = CEO only. Even for short chat: do not start product edits.",
      "If work appears next, hand off to Codex immediately.",
      "</lfg-codex-skill-assign>",
    ].join("\n")
  }

  const gitOnly =
    hints.includes("git") && !hints.some((h) => ["implementation", "fix", "refactor", "judgment"].includes(h))

  if (gitOnly) {
    return [
      "<lfg-codex-skill-assign force=\"true\">",
      "FORCE: pure git → agent git-master (or git-only brief). Not product coding.",
      "Grok CEO does not implement. Do not edit product files yourself.",
      "1) lfg --json orchestrator ask --text \"…\"",
      "2) spawn/use git-master with skill git-master",
      "3) After reply: lfg --json orchestrator answer --ask-id … --summary \"…\"",
      "</lfg-codex-skill-assign>",
    ].join("\n")
  }

  return [
    "<lfg-codex-skill-assign force=\"true\">",
    "FORCE HANDOFF — Sisyphus does NOT do the work. Codex (LazyCodex) does.",
    "Grok = CEO + orchestrator only. Always doubt yourself; task Codex.",
    `Intent: ${hints.length > 0 ? hints.join(", ") : "general-work"}.`,
    "THIS TURN you MUST run (real shell, in order):",
    `  1) lfg --json orchestrator ask --text "${focus}"`,
    `  2) lfg --json handoff plan --role coding --engine gpt --focus "${focus}"`,
    "  3) Launch handoff.launch.argv → codex (engine gpt). Do not edit product files.",
    "  4) lfg --json orchestrator status && lfg --json orchestrator poll",
    "     Observe only. Do not send any midflight Codex nudge while the worker is running.",
    "  5) When RESULT ready: synthesize for user FROM Codex evidence only.",
    "  6) lfg --json orchestrator answer --ask-id <id> --summary \"what you told the user\"",
    "FORBIDDEN for Sisyphus/Watcher/Explorer: search_replace, write, multi_edit, apply_patch, product-mutating shell.",
    "If you catch yourself about to edit: STOP → step 2 handoff to Codex.",
    "</lfg-codex-skill-assign>",
  ].join("\n")
}

function firstString(record, keys) {
  if (typeof record !== "object" || record === null) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    input.on("data", (c) => chunks.push(c))
    input.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    input.on("error", reject)
  })
}

main().catch(() => process.exit(0))
