#!/usr/bin/env node
/**
 * UserPromptSubmit: ALWAYS force Grok CEO → Codex handoff (not optional word-match).
 * Sisyphus must not do the work; LazyCodex/Codex must.
 */
import { stdin as input, stdout as output } from "node:process"
import { execFile } from "node:child_process"
import { access, mkdir, writeFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

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
  const projectRoot = firstString(payload, ["cwd", "projectRoot", "project_root"]) ?? process.env.LFG_HOOK_PROJECT_ROOT ?? process.cwd()
  const autoHandoff = await executeCodexHandoff(prompt, hookEventName, projectRoot)
  const autoContext = autoHandoff.ok
    ? `<lfg-auto-goal status="executed" thread_id="${autoHandoff.threadId ?? "unknown"}" monitor="${autoHandoff.monitor?.attached ? "attached" : "pending"}">ALREADY EXECUTED via goal drive + ulw-loop. Do not re-launch; poll goal board / orchestrator watch.</lfg-auto-goal>`
    : autoHandoff.reason === "goal_clear"
      ? '<lfg-auto-goal status="skipped" reason="goal_clear">Goal clear is display-only; do not launch Codex.</lfg-auto-goal>'
      : '<lfg-auto-goal status="not-launched">The auto goal failed; follow the fallback handoff guidance.</lfg-auto-goal>'

  output.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: `${sisyphusCeoProtocol()}\n${autoContext}\n${body}`,
      },
      statusMessage: autoHandoff.ok
        ? `LFG: goal drive attached monitor thread=${autoHandoff.threadId ?? "?"}`
        : "LFG: CEO must goal-drive Codex (ulw-loop)",
      autoHandoff,
    })}\n`,
  )
}

async function executeCodexHandoff(prompt, hookEventName, cwd) {
  if (process.env.LFG_CODEX_ASSIGN_AUTO_EXECUTE === "0" || !/UserPromptSubmit/i.test(hookEventName)) {
    return { attempted: false, ok: false, status: "skipped", transport: null }
  }
  const focus = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ").slice(0, 500) : ""
  if (focus.length === 0 || SKIP_HANDOFF.test(focus) || /^\/goal\s+clear\b/i.test(focus)) {
    return { attempted: false, ok: false, status: "skipped", transport: null, reason: /^\/goal\s+clear\b/i.test(focus) ? "goal_clear" : "not_applicable" }
  }
  try {
    const cli = await resolveLfgCli()
    if (cli === null) throw new Error("lfg CLI not found")
    // Primary: ulw-loop goal drive (Codex App + monitor attach)
    let argv = goalDriveArgv(focus, cwd)
    let result = await executeLfgSafe(cli, argv, cwd)
    // Ensure ulw-loop plan exists, then drive again
    if (isPlanMissing(result) || isDriveFail(result)) {
      const sessionId = currentUlwLoopSessionId()
      await executeLfgSafe(cli, [
        "--json", "ulw-loop", "create-goals",
        ...(sessionId === null ? [] : ["--session-id", sessionId]),
        "--force", "--brief", focus,
      ], cwd)
      result = await executeLfgSafe(cli, goalDriveArgv(focus, cwd), cwd)
    }
    // Fallback: plan goal (still app-server + monitor)
    if (isDriveFail(result)) {
      argv = ["--json", "plan", "goal", "--focus", focus, ...(cwd ? ["--cwd", cwd] : [])]
      result = await executeLfgSafe(cli, argv, cwd)
    }
    // Last resort: handoff plan
    if (isDriveFail(result)) {
      argv = fallbackHandoffArgv(focus, cwd)
      result = await executeLfgSafe(cli, argv, cwd)
    }
    const ok = result?.ok === true || result?.status === "goal_driven" || result?.status === "goal_synced" || result?.status === "handed_off"
    const receipt = {
      version: 1,
      recordedAt: new Date().toISOString(),
      prompt: focus.slice(0, 500),
      argv,
      status: typeof result?.status === "string" ? result.status : "unknown",
      ok,
      threadId: pickThreadId(result),
      transport: pickTransport(result),
      monitor: result?.monitor ?? null,
      goal: result?.goal ?? null,
    }
    if (cwd) await writeAutoGoalReceipt(cwd, receipt)
    return {
      attempted: true,
      ok,
      status: receipt.status,
      transport: receipt.transport,
      threadId: receipt.threadId,
      monitor: receipt.monitor,
      goal: receipt.goal,
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: "launch_failed",
      transport: null,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown launch failure",
    }
  }
}

function currentUlwLoopSessionId() {
  for (const key of ["OMO_ULW_LOOP_SESSION_ID", "LFG_ULW_LOOP_SESSION_ID", "GROK_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID"]) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

function goalDriveArgv(focus, cwd) {
  const argv = [
    "--json", "goal", "drive",
    "--skill", "ulw-loop",
    "--skill", "programming",
    "--focus", focus,
  ]
  if (typeof cwd === "string" && cwd.length > 0) argv.push("--cwd", cwd)
  return argv
}

function fallbackHandoffArgv(focus, cwd) {
  const argv = ["--json", "handoff", "plan", "--role", "coding", "--engine", "gpt", "--focus", focus]
  if (typeof cwd === "string" && cwd.length > 0) argv.push("--cwd", cwd)
  return argv
}

function isPlanMissing(result) {
  const err = typeof result?.error === "string" ? result.error : ""
  return /ULW_LOOP_PLAN_MISSING|No ulw-loop plan/i.test(err) || result?.status === "invalid_goal_plan" && /ulw-loop plan/i.test(err)
}

function isDriveFail(result) {
  if (result == null) return true
  if (result.ok === true) return false
  if (result.status === "goal_driven" || result.status === "goal_synced" || result.status === "handed_off" || result.status === "goal_board_complete") return false
  return true
}

function pickThreadId(result) {
  if (typeof result?.threadId === "string") return result.threadId
  if (typeof result?.orchestrator?.threadId === "string") return result.orchestrator.threadId
  if (typeof result?.orchestrator?.appServerThreadId === "string") return result.orchestrator.appServerThreadId
  if (typeof result?.monitor?.appServer?.activeThreadIds?.[0] === "string") return result.monitor.appServer.activeThreadIds[0]
  return null
}

function pickTransport(result) {
  if (typeof result?.transport === "string") return result.transport
  if (typeof result?.transport?.transport === "string") return result.transport.transport
  return null
}

async function executeLfgSafe(cli, argv, cwd) {
  try {
    return await executeLfg(cli, argv, cwd)
  } catch (error) {
    return {
      ok: false,
      status: "exec_error",
      error: error instanceof Error ? error.message.slice(0, 500) : "exec error",
    }
  }
}

async function executeLfg(cli, argv, cwd) {
  const { stdout } = await execFileAsync(cli.command, [...cli.prefix, ...argv], {
    ...(cwd ? { cwd } : {}), env: process.env, timeout: 120_000, maxBuffer: 1024 * 1024,
  })
  return JSON.parse(stdout)
}

async function resolveLfgCli() {
  for (const configured of [process.env.LFG_BIN, process.env.LFG_CLI_BINARY]) {
    const value = configured?.trim()
    if (value && await executable(value)) return { command: value, prefix: [] }
  }
  const homeWrapper = join(process.env.HOME ?? "", ".grok", "bin", process.platform === "win32" ? "lfg.cmd" : "lfg")
  if (await executable(homeWrapper)) return { command: homeWrapper, prefix: [] }
  const pathBinary = await findOnPath("lfg")
  if (pathBinary !== null) return { command: pathBinary, prefix: [] }
  const repoDist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "dist", "lfg.js")
  if (await readable(repoDist)) return { command: process.execPath, prefix: [repoDist] }
  return null
}

async function findOnPath(binary) {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(directory, binary)
    if (await executable(candidate)) return candidate
  }
  return null
}

async function executable(path) { try { await access(path, fsConstants.X_OK); return true } catch { return false } }
async function readable(path) { try { await access(path, fsConstants.R_OK); return true } catch { return false } }

async function writeAutoGoalReceipt(projectRoot, receipt) {
  const path = join(projectRoot, ".omo", "orchestrator", "auto-goal-receipt.json")
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
}

function sisyphusCeoProtocol() {
  return [
    '<lfg-sisyphus-ceo-protocol force="true">',
    "For every product ask: restate intent, route OMO skills (programming/frontend/debugging/ulw-plan/start-work/…), craft a brief that HARD REQUIREs those skills, and hand off execution.",
    "Never forget skill assignment: focus must carry SKILLS[...] or the handoff planner will auto-route from focus.",
    'Run: lfg --json goal drive --skill ulw-loop --skill programming --focus "<intent + brief>"',
    "Monitor immediately: lfg --json goal board && lfg --json goal poll / orchestrator watch --follow.",
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
    'All product work MUST run: lfg --json goal drive --skill ulw-loop --skill programming --focus "…"',
    "That attaches Codex App + monitor; poll with goal board / goal poll / orchestrator watch --follow.",
    "Never use an in-host implementer. LazyCodex is handoff-only: never probe, setup, install, or run Codex or lazycodex-ai.",
    "</lfg-codex-startup>",
  ].join("\n")
}

export function buildCodexAssignContext(prompt) {
  if (typeof prompt !== "string") return null
  const trimmed = prompt.trim()
  if (trimmed.length === 0) return null

  const focus = trimmed.replace(/\s+/g, " ").slice(0, 180).replace(/"/g, "'")
  if (/^\/goal\s+clear\b/i.test(trimmed)) return ['<lfg-codex-goal-clear skip="true">', "Goal clear is display-only; do not launch Codex.", "</lfg-codex-goal-clear>"].join("\n")
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
      "The host /goal surface is display-only; Grok may set, update, or clear that display but never execute the work.",
      "Grok MUST launch Codex for the goal WORK body via goal drive + ulw-loop.",
      `MUST run: lfg --json goal drive --skill ulw-loop --skill programming --focus "${focus}"`,
      "If no plan exists: lfg --json ulw-loop create-goals --force --brief \"…\" then goal drive again.",
      "goal drive attaches Codex App + monitor; poll goal board / goal poll / orchestrator watch --follow for RESULT.",
      "The Codex worker MUST load $ulw-loop (and $start-work / $ulw-plan when those apply).",
      "FORBIDDEN: Grok implementing under /goal alone.",
      "Do not edit product files in Grok.",
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
      "Prefer normal project diffs; optional receipts only if a result path was requested.",
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
    "Grok = CEO + orchestrator only. Always doubt yourself; task Codex via goal + ulw-loop.",
    `Intent: ${hints.length > 0 ? hints.join(", ") : "general-work"}.`,
    "THIS TURN you MUST run (real shell, in order):",
    `  1) lfg --json orchestrator ask --text "${focus}"`,
    `  2) lfg --json goal drive --skill ulw-loop --skill programming --focus "${focus}"`,
    "     (If ULW_LOOP_PLAN_MISSING: lfg --json ulw-loop create-goals --force --brief \"…\" then goal drive again.)",
    "  3) Monitor is attached by goal drive. Observe only:",
    "     lfg --json goal board && lfg --json goal poll",
    "     or lfg --json orchestrator watch --follow",
    "     Do not send any midflight Codex nudge while the worker is running.",
    "  4) When RESULT ready: synthesize for user FROM Codex evidence only.",
    "  5) lfg --json orchestrator answer --ask-id <id> --summary \"what you told the user\"",
    "FORBIDDEN for Sisyphus/Watcher/Explorer: search_replace, write, multi_edit, apply_patch, product-mutating shell.",
    "If you catch yourself about to edit: STOP → step 2 goal drive to Codex.",
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
