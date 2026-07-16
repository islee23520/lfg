#!/usr/bin/env node
/**
 * SessionStart + UserPromptSubmit + Stop: load/poll .omo/orchestrator/inbox.json,
 * record the latest user prompt as an ask (UserPromptSubmit), inject CEO dashboard context.
 *
 * Keeps multi-Codex thread monitoring durable so Grok can aggregate before answering.
 */
import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { stdin as input, stdout as output, cwd } from "node:process"

const VERSION = 1
const INBOX_REL = join(".omo", "orchestrator", "inbox.json")
const APP_SERVER_CHANNEL_TIMEOUT_MS = 3_000
const APP_SERVER_CHANNEL_POLL_MS = 250

async function main() {
  const raw = await readStdin()
  let payload = {}
  try {
    payload = raw.trim().length === 0 ? {} : JSON.parse(raw)
  } catch {
    process.exit(0)
  }

  const event =
    firstString(payload, ["hookEventName", "hook_event_name"]) ??
    process.env.GROK_HOOK_EVENT ??
    "UserPromptSubmit"
  const projectRoot =
    firstString(payload, ["cwd", "workspace_root", "workspaceRoot"]) ?? cwd()
  const prompt = firstString(payload, ["prompt", "userQuery", "user_query", "message"]) ?? ""
  const isStop = /^Stop$/i.test(event.trim())
  const isSessionStart = /SessionStart/i.test(event)
  const sessionSource =
    firstString(payload, ["source", "session_source", "sessionSource"]) ??
    process.env.GROK_SESSION_SOURCE ??
    "startup"

  try {
    let inbox = await loadInbox(projectRoot)
    if (/UserPromptSubmit/i.test(event) && prompt.trim().length > 0) {
      inbox = recordAsk(inbox, prompt)
    }
    inbox = await pollResults(projectRoot, inbox)
    await saveInbox(projectRoot, inbox)
    const monitor = await refreshLiveMonitorBoard(projectRoot, isSessionStart)
    inbox = monitor.inbox
    const recovery = isSessionStart ? await sessionAutoResumeBlock(projectRoot, inbox, sessionSource) : ""
    const mcpGate = isSessionStart ? await waitForAppServerChannelReady(projectRoot, sessionSource) : null
    const continuation = isSessionStart && mcpGate?.ready
      ? await continuePriorWork(projectRoot, inbox, sessionSource)
      : null
    const baseContext = renderContext(inbox)
    const context = [monitor.context, mcpGate?.context ?? "", continuation?.context ?? "", recovery, baseContext, isStop ? stopCodexMonitorGate() : ""]
      .filter(Boolean)
      .join("\n")
    if (context.length === 0) process.exit(0)
    const hookEventName = isStop
      ? "Stop"
      : /SessionStart/i.test(event)
        ? "SessionStart"
        : "UserPromptSubmit"
    output.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName,
          additionalContext: context,
        },
        statusMessage: monitor.statusMessage,
      })}\n`,
    )
  } catch {
    process.exit(0)
  }
}

async function refreshLiveMonitorBoard(projectRoot, isSessionStart) {
  const cli = process.env.LFG_MONITOR_BOARD_AUTO_EXECUTE === "0" ? null : await resolveLfgCli()
  const poll = cli === null ? null : await runLfgJson(cli, ["--json", "orchestrator", "poll", "--cwd", projectRoot], projectRoot, 1_000)
  const polledInbox = await loadInbox(projectRoot)
  const autoGoal = cli === null ? null : await startUnassignedGoal(cli, projectRoot, polledInbox)
  const watchArgs = ["--json", "orchestrator", "watch", "--cwd", projectRoot, ...(isSessionStart ? [] : ["--no-start-daemon"])]
  const watch = cli === null ? null : await runLfgJson(cli, watchArgs, projectRoot, isSessionStart ? 1_500 : 750)
  const inbox = await loadInbox(projectRoot)
  const board = buildMonitorBoard(inbox, watch)
  const boardPath = join(projectRoot, ".omo", "orchestrator", "monitor-board.json")
  await mkdir(dirname(boardPath), { recursive: true })
  await writeFile(boardPath, `${JSON.stringify(board, null, 2)}\n`, "utf8")
  return { inbox, context: renderMonitorBoard(board), statusMessage: monitorStatusMessage(board), poll, autoGoal, watch }
}

async function startUnassignedGoal(cli, projectRoot, inbox) {
  const hasRunningThread = (inbox.threads ?? []).some((thread) => thread && (thread.status === "planned" || thread.status === "running"))
  if (hasRunningThread) return null
  const ask = (inbox.asks ?? []).find((candidate) => candidate && candidate.status === "open" && (candidate.threadIds?.length ?? 0) === 0)
  if (!ask) return null
  return runLfgJson(cli, ["--json", "goal", "--focus", ask.userText, "--cwd", projectRoot, "--ask-id", ask.id], projectRoot, 2_000)
}

function buildMonitorBoard(inbox, watch) {
  const unanswered = (inbox.asks ?? []).filter((ask) => ask && ask.status !== "answered")
  const running = (inbox.threads ?? []).filter((thread) => thread && (thread.status === "planned" || thread.status === "running"))
  const ready = (inbox.threads ?? []).filter((thread) => thread && thread.status === "result_ready")
  const failed = (inbox.threads ?? []).filter((thread) => thread && thread.status === "failed")
  return {
    version: 1,
    recordedAt: new Date().toISOString(),
    source: "hook",
    counts: { unanswered: unanswered.length, running: running.length, ready: ready.length, failed: failed.length },
    appServer: watch?.appServer?.availability ?? (watch?.status === "orchestrator_app_server_synced" ? "available" : "missing"),
    asks: unanswered.slice(0, 8),
    threads: [...ready, ...failed, ...running].slice(0, 12),
    duty: ready.length > 0 ? "answer" : running.length > 0 ? "wait_no_rehandoff" : unanswered.length > 0 ? "auto_goal_required" : "HEARTBEAT_OK",
  }
}

function renderMonitorBoard(board) {
  const lines = [
    '<lfg-monitor-board source="hook" force="true">',
    `unanswered=${board.counts.unanswered} running=${board.counts.running} ready=${board.counts.ready} failed=${board.counts.failed} app_server=${board.appServer}`,
  ]
  for (const ask of board.asks) lines.push(`ASK ${ask.id} status=${ask.status} text=${clip(ask.userText, 120)}`)
  for (const thread of board.threads) lines.push(`THR ${thread.id} status=${thread.status} result=${thread.resultPath}`)
  lines.push(`duty: ${board.duty === "answer" ? "if ready → answer" : board.duty === "wait_no_rehandoff" ? "if running → wait (no re-handoff)" : board.duty === "auto_goal_required" ? "if unanswered → auto goal" : "if none → HEARTBEAT_OK"}`)
  lines.push("</lfg-monitor-board>")
  return lines.join("\n")
}

function monitorStatusMessage(board) {
  return board.counts.running > 0 || board.counts.ready > 0
    ? `LFG monitor: running=${board.counts.running} ready=${board.counts.ready} failed=${board.counts.failed}`
    : "LFG monitor: HEARTBEAT_OK"
}

async function runLfgJson(cli, argv, projectRoot, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(cli.command, [...cli.prefix, ...argv], { cwd: projectRoot, env: process.env })
    let stdout = ""
    let settled = false
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); if (child.exitCode === null) child.kill(); resolveRun(value) }
    const timer = setTimeout(() => finish(null), timeoutMs)
    child.stdout.on("data", (chunk) => { if (stdout.length < 1024 * 1024) stdout += String(chunk) })
    child.once("error", () => finish(null))
    child.once("close", () => { try { finish(JSON.parse(stdout)) } catch { finish(null) } })
  })
}

async function resolveLfgCli() {
  for (const configured of [process.env.LFG_BIN, process.env.LFG_CLI_BINARY]) {
    const value = configured?.trim()
    if (value && await isExecutable(value)) return { command: value, prefix: [] }
  }
  const homeWrapper = join(process.env.HOME ?? "", ".grok", "bin", process.platform === "win32" ? "lfg.cmd" : "lfg")
  if (await isExecutable(homeWrapper)) return { command: homeWrapper, prefix: [] }
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(directory, process.platform === "win32" ? "lfg.cmd" : "lfg")
    if (await isExecutable(candidate)) return { command: candidate, prefix: [] }
  }
  const repoDist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "dist", "lfg.js")
  try { await access(repoDist, fsConstants.R_OK); return { command: process.execPath, prefix: [repoDist] } } catch { return null }
}

async function waitForAppServerChannelReady(projectRoot, sessionSource) {
  const timeoutMs = positiveInteger(process.env.LFG_MCP_READY_TIMEOUT_MS, APP_SERVER_CHANNEL_TIMEOUT_MS)
  const startedAt = Date.now()
  let readinessSource = await probeGrokCodexChannel(projectRoot, timeoutMs)
  while (!readinessSource && Date.now() - startedAt < timeoutMs) {
    await delay(Math.min(APP_SERVER_CHANNEL_POLL_MS, Math.max(0, timeoutMs - (Date.now() - startedAt))))
    readinessSource = await probeGrokCodexChannel(projectRoot, timeoutMs)
  }
  const ready = readinessSource !== null
  const action = ready ? "mcp_ready" : "mcp_timeout"
  const receipt = {
    version: 1,
    recordedAt: new Date().toISOString(),
    source: clip(sessionSource, 24),
    action,
    guidance: ready ? "continue_prior_work" : "soft_wait",
    timeoutMs,
    pollMs: APP_SERVER_CHANNEL_POLL_MS,
    channel: "grok_codex",
    readinessSource,
  }
  await writeReceipt(
    join(projectRoot, ".omo", "orchestrator", "sessionstart-mcp-ready-receipt.json"),
    receipt,
  )
  return { ready, context: renderMcpReadyContext(receipt) }
}

async function probeGrokCodexChannel(projectRoot, timeoutMs) {
  if (hostMcpReadyEnvironment()) return "host_environment"
  const probe = process.env.LFG_MCP_READY_PROBE?.trim()
  if (probe && await launchMcpProbe(probe, projectRoot)) return "ready_probe"
  const marker = process.env.LFG_MCP_READY_MARKER?.trim()
  if (marker && (isReadyValue(marker) || await markerIsReady(marker))) {
    return "ready_marker"
  }
  const binary = await resolveCodexBinary()
  return binary && await probeCodexAppServer(binary, projectRoot, Math.min(timeoutMs, 1_000))
    ? "codex_app_server"
    : null
}

function hostMcpReadyEnvironment() {
  return [process.env.LFG_MCP_READY, process.env.GROK_MCP_READY]
    .some((value) => /^(1|true|ready)$/i.test(value?.trim() ?? ""))
}

async function launchMcpProbe(binary, projectRoot) {
  return new Promise((resolveProbe) => {
    const child = spawn(binary, [], { cwd: projectRoot, stdio: "ignore" })
    child.once("close", (code) => resolveProbe(code === 0))
    child.once("error", () => resolveProbe(false))
  })
}

async function markerIsReady(markerPath) {
  try {
    const raw = (await readFile(markerPath, "utf8")).trim()
    if (isReadyValue(raw)) return true
    const marker = JSON.parse(raw)
    return marker?.ready === true
  } catch {
    return false
  }
}

async function resolveCodexBinary() {
  const configuredBinary = process.env.LFG_CODEX_BINARY?.trim()
  const binary = configuredBinary || "codex"
  if (isAbsolute(binary) || binary.includes("/") || binary.includes("\\")) {
    return await isExecutable(binary) ? binary : null
  }
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""]
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${binary}${extension}`)
      if (await isExecutable(candidate)) return candidate
    }
  }
  return null
}

async function probeCodexAppServer(binary, projectRoot, timeoutMs) {
  await runBounded(binary, ["app-server", "daemon", "start"], projectRoot, timeoutMs)
  if (await probeCodexProxy(binary, projectRoot, timeoutMs)) return true
  if (await probeCodexProxy(binary, projectRoot, timeoutMs)) return true
  return probeCodexStdio(binary, projectRoot, timeoutMs)
}

async function runBounded(binary, args, projectRoot, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(binary, args, { cwd: projectRoot, stdio: "ignore" })
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (child.exitCode === null) child.kill()
      resolveRun(ok)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once("error", () => finish(false))
    child.once("close", (code) => finish(code === 0))
  })
}

async function probeCodexProxy(binary, projectRoot, timeoutMs) {
  return new Promise((resolveProbe) => {
    const child = spawn(binary, ["app-server", "proxy"], { cwd: projectRoot })
    const key = randomBytes(16).toString("base64")
    const expected = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
    let buffer = Buffer.alloc(0)
    let upgraded = false
    let settled = false
    const finish = (ready) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolveProbe(ready)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once("error", () => finish(false))
    child.once("close", () => finish(false))
    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!upgraded) {
        const end = buffer.indexOf("\r\n\r\n")
        if (end < 0) return
        const headers = buffer.subarray(0, end + 4).toString("utf8")
        buffer = buffer.subarray(end + 4)
        if (!headers.startsWith("HTTP/1.1 101") || !headers.toLowerCase().includes(`sec-websocket-accept: ${expected.toLowerCase()}`)) return finish(false)
        upgraded = true
        child.stdin.write(maskedWebSocketFrame({ id: 1, method: "initialize", params: { clientInfo: { name: "lfg-sessionstart", version: "1" }, capabilities: { experimentalApi: false } } }))
      }
      for (;;) {
        const frame = readWebSocketFrame(buffer)
        if (!frame) return
        buffer = buffer.subarray(frame.bytes)
        let message
        try { message = JSON.parse(frame.payload.toString("utf8")) } catch { continue }
        if (message?.id === 1) {
          child.stdin.write(maskedWebSocketFrame({ method: "initialized" }))
          child.stdin.write(maskedWebSocketFrame({ id: 2, method: "thread/list", params: { cwd: projectRoot, limit: 1 } }))
        }
        if (message?.id === 2) finish(!message.error)
      }
    })
    child.stdin.write(["GET / HTTP/1.1", "Host: localhost", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", "", ""].join("\r\n"))
  })
}

function maskedWebSocketFrame(message) {
  const payload = Buffer.from(JSON.stringify(message))
  const mask = randomBytes(4)
  const header = payload.length < 126
    ? Buffer.from([0x81, 0x80 | payload.length])
    : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff])
  const masked = Buffer.alloc(payload.length)
  for (let index = 0; index < payload.length; index += 1) masked[index] = payload[index] ^ mask[index % 4]
  return Buffer.concat([header, mask, masked])
}

function readWebSocketFrame(buffer) {
  if (buffer.length < 2) return null
  const code = buffer[1] & 0x7f
  const offset = code < 126 ? 2 : code === 126 ? 4 : 10
  if (buffer.length < offset) return null
  const length = code < 126 ? code : code === 126 ? buffer.readUInt16BE(2) : Number(buffer.readBigUInt64BE(2))
  if (!Number.isSafeInteger(length) || buffer.length < offset + length) return null
  return { payload: buffer.subarray(offset, offset + length), bytes: offset + length }
}

async function probeCodexStdio(binary, projectRoot, timeoutMs) {
  return new Promise((resolveProbe) => {
    const child = spawn(binary, ["app-server", "--stdio"], { cwd: projectRoot })
    let buffer = ""
    let settled = false
    const finish = (ready) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolveProbe(ready)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once("error", () => finish(false))
    child.once("close", () => finish(false))
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8")
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        let message
        try { message = JSON.parse(line) } catch { continue }
        if (message?.id === 1) {
          child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`)
          child.stdin.write(`${JSON.stringify({ id: 2, method: "thread/list", params: { cwd: projectRoot, limit: 1 } })}\n`)
        }
        if (message?.id === 2) finish(!message.error)
      }
    })
    child.stdin.write(`${JSON.stringify({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "lfg-sessionstart", version: "1" }, capabilities: { experimentalApi: false } },
    })}\n`)
  })
}

async function isExecutable(path) {
  try {
    await access(path, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

function isReadyValue(value) {
  return /^(1|true|ready)$/i.test(value)
}

function renderMcpReadyContext(receipt) {
  const lines = [
    `<lfg-mcp-ready-gate status="${receipt.action}">`,
    `receipt=.omo/orchestrator/sessionstart-mcp-ready-receipt.json channel=grok_codex source=${receipt.readinessSource ?? "none"} timeout_ms=${receipt.timeoutMs} poll_ms=${receipt.pollMs}`,
  ]
  if (receipt.action === "mcp_ready") {
    lines.push("Grok-Codex thread channel readiness confirmed; prior-work continuation may proceed.")
  } else {
    lines.push("Grok-Codex channel readiness timed out. Soft-wait for the communication channel and do not force prior-work resume this SessionStart.")
  }
  lines.push("</lfg-mcp-ready-gate>")
  return lines.join("\n")
}

function positiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw ?? "", 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function continuePriorWork(projectRoot, inbox, sessionSource) {
  const thread = (inbox.threads ?? []).find((candidate) => {
    if (!candidate || !["planned", "running", "stale"].includes(candidate.status)) return false
    return continuationSessionId(candidate) !== null
  })
  const receiptPath = join(projectRoot, ".omo", "orchestrator", "sessionstart-continue-work-receipt.json")
  const recordedAt = new Date().toISOString()
  if (!thread) {
    const receipt = {
      version: 1,
      recordedAt,
      source: clip(sessionSource, 24),
      action: "no_prior_work",
      guidance: "soft",
      threadId: null,
      sessionId: null,
      resultPath: null,
      argv: null,
    }
    await writeReceipt(receiptPath, receipt)
    return { context: renderContinuationContext(receipt) }
  }

  const sessionId = continuationSessionId(thread)
  const guidance = thread.status === "stale" || thread.appServerStatus === "active"
    ? "soft_stale_live"
    : "force_resume"
  const configuredBinary = process.env.LFG_CODEX_BINARY?.trim()
  const binary = configuredBinary || "codex"
  const prompt = [
    `Continue the prior lfg work for thread ${thread.id}.`,
    `Focus: ${clip(thread.focus, 500)}`,
    `Finish the work and write STATUS/SUMMARY/EVIDENCE to ${thread.resultPath}.`,
  ].join(" ")
  const argv = ["codex", "exec", "resume", sessionId, prompt]
  const launched = await launchCodexResume(binary, argv.slice(1), projectRoot, Boolean(configuredBinary))
  const receipt = {
    version: 1,
    recordedAt,
    source: clip(sessionSource, 24),
    action: launched ? "codex_exec_resume" : "resume_launch_failed",
    guidance,
    threadId: thread.id,
    sessionId,
    resultPath: thread.resultPath,
    argv,
  }
  await writeReceipt(receiptPath, receipt)
  return { context: renderContinuationContext(receipt) }
}

function continuationSessionId(thread) {
  for (const value of [thread.appServerSessionId, thread.sessionHint, thread.appServerThreadId]) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim()
  }
  return null
}

async function launchCodexResume(binary, args, projectRoot, awaitExit) {
  return new Promise((resolveLaunch) => {
    const child = spawn(binary, args, { cwd: projectRoot, detached: !awaitExit, stdio: "ignore" })
    if (awaitExit) {
      child.once("close", (code) => resolveLaunch(code === 0))
      child.once("error", () => resolveLaunch(false))
      return
    }
    child.once("spawn", () => {
      child.unref()
      resolveLaunch(true)
    })
    child.once("error", () => resolveLaunch(false))
  })
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await writeFile(tmp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
  await rename(tmp, path)
}

function renderContinuationContext(receipt) {
  const lines = [
    `<lfg-sessionstart-continue-work force="true" action="${receipt.action}" guidance="${receipt.guidance}">`,
    `receipt=.omo/orchestrator/sessionstart-continue-work-receipt.json source=${receipt.source}`,
  ]
  if (receipt.sessionId) {
    lines.push(`thread=${receipt.threadId} session=${receipt.sessionId} result=${receipt.resultPath}`)
    lines.push(`resume=codex exec resume ${receipt.sessionId}`)
  } else {
    lines.push("No resumable prior Codex session was recorded; keep the continuation monitor active.")
  }
  lines.push("Stale/live metadata changes guidance only; a recorded session is still resumed.")
  lines.push("</lfg-sessionstart-continue-work>")
  return lines.join("\n")
}

async function sessionAutoResumeBlock(projectRoot, inbox, sessionSource) {
  const asks = (inbox.asks ?? []).filter(
    (ask) => ask && (ask.status === "open" || ask.status === "in_progress" || ask.status === "blocked"),
  )
  const running = (inbox.threads ?? []).filter(
    (thread) => thread && (thread.status === "planned" || thread.status === "running"),
  )
  const linkedReady = (inbox.threads ?? []).filter(
    (thread) =>
      thread &&
      (thread.status === "result_ready" || thread.status === "failed") &&
      asks.some(
        (ask) =>
          (Array.isArray(ask.threadIds) && ask.threadIds.includes(thread.id)) ||
          (Array.isArray(thread.askIds) && thread.askIds.includes(ask.id)),
      ),
  )
  const incomplete = await discoverIncompleteExternalEngineWork(projectRoot)
  const lines = [
    '<lfg-session-auto-resume force="true">',
    '<lfg-session-monitor-start force="true">',
    `source=${clip(sessionSource, 24)} recover_asks=${asks.length} running_threads=${running.length} ready_unanswered=${linkedReady.length} incomplete_external=${incomplete.length}`,
    "START MONITORING THIS TURN: open M1–M5 before continuing, even when the inbox is empty.",
    "Run via shell now:",
    "  lfg --json orchestrator status",
    "  lfg --json orchestrator poll",
    "  lfg --json orchestrator watch",
    "For every planned/running thread, keep monitoring resultPath until STATUS; do not re-launch a duplicate unless RESULT is missing and the thread is dead.",
    "When RESULT is ready but its linked ask is unanswered, synthesize the evidence and run `lfg --json orchestrator answer --ask-id <id> --summary \"…\"`.",
  ]
  if (asks.length === 0 && running.length === 0 && linkedReady.length === 0 && incomplete.length === 0) {
    lines.push("No ledger recoverables were found; resume/compact still requires one status/poll/watch re-check.")
  }
  for (const ask of asks.slice(0, 8)) lines.push(`ASK ${ask.id} status=${ask.status}`)
  for (const thread of [...running, ...linkedReady].slice(0, 12)) {
    lines.push(`THR ${thread.id} status=${thread.status} result=${clip(thread.resultPath, 180)}`)
  }
  for (const resultPath of incomplete.slice(0, 8)) lines.push(`INCOMPLETE result=${clip(resultPath, 180)}`)
  lines.push("This is force guidance injected by the hook; the host does not hard-block tool execution.")
  lines.push("</lfg-session-monitor-start>")
  lines.push("</lfg-session-auto-resume>")
  return lines.join("\n")
}

async function discoverIncompleteExternalEngineWork(projectRoot) {
  const relativeDir = join(".omo", "orchestrator")
  try {
    const entries = await readdir(join(projectRoot, relativeDir), { withFileTypes: true })
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name))
    return [...names]
      .filter((name) => name.endsWith("-payload.md"))
      .map((name) => name.slice(0, -"-payload.md".length))
      .filter((stem) => !names.has(`${stem}-result.md`))
      .map((stem) => join(relativeDir, `${stem}-result.md`))
      .slice(0, 20)
  } catch {
    return []
  }
}

function emptyInbox() {
  const now = new Date().toISOString()
  return { version: VERSION, updatedAt: now, asks: [], threads: [] }
}

async function loadInbox(projectRoot) {
  const path = join(projectRoot, INBOX_REL)
  try {
    const raw = await readFile(path, "utf8")
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.asks)) return emptyInbox()
    return {
      version: VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      asks: Array.isArray(parsed.asks) ? parsed.asks : [],
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    }
  } catch {
    return emptyInbox()
  }
}

async function saveInbox(projectRoot, inbox) {
  const path = join(projectRoot, INBOX_REL)
  await mkdir(dirname(path), { recursive: true })
  const next = { ...inbox, updatedAt: new Date().toISOString() }
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  await rename(tmp, path)
}

function recordAsk(inbox, userText) {
  const now = new Date().toISOString()
  const text = String(userText).trim().slice(0, 2000)
  // Dedupe: same text within 30s and still open/in_progress
  const recent = inbox.asks.find(
    (a) =>
      a &&
      a.userText === text &&
      (a.status === "open" || a.status === "in_progress") &&
      typeof a.createdAt === "string" &&
      Date.now() - Date.parse(a.createdAt) < 30_000,
  )
  if (recent) return inbox
  const ask = {
    id: `ask-${hash(text + now).slice(0, 10)}`,
    userText: text,
    createdAt: now,
    updatedAt: now,
    status: "open",
    userAnsweredAt: null,
    answerSummary: null,
    threadIds: [],
  }
  return { ...inbox, asks: [ask, ...inbox.asks].slice(0, 200), updatedAt: now }
}

async function pollResults(projectRoot, inbox) {
  const now = new Date().toISOString()
  const threads = []
  for (const thr of inbox.threads ?? []) {
    if (!thr || typeof thr.resultPath !== "string") continue
    const abs = resolve(projectRoot, thr.resultPath)
    const polled = await readResult(abs)
    if (!polled) {
      threads.push(thr)
      continue
    }
    threads.push({
      ...thr,
      status: polled.failed ? "failed" : "result_ready",
      resultStatus: polled.status,
      resultSnippet: polled.snippet,
      updatedAt: now,
    })
  }
  const asks = (inbox.asks ?? []).map((ask) => {
    if (!ask || ask.status === "answered") return ask
    const linked = threads.filter((t) => Array.isArray(ask.threadIds) && ask.threadIds.includes(t.id))
    if (linked.length === 0) return ask
    const anyFailed = linked.some((t) => t.status === "failed")
    const allReady = linked.every((t) => t.status === "result_ready" || t.status === "failed")
    if (allReady) return { ...ask, status: anyFailed ? "blocked" : "in_progress", updatedAt: now }
    return { ...ask, status: "in_progress", updatedAt: now }
  })
  return { ...inbox, threads, asks, updatedAt: now }
}

async function readResult(absPath) {
  try {
    await access(absPath)
    const text = await readFile(absPath, "utf8")
    if (!text.trim()) return null
    const m = /STATUS:\s*([^\n\r]+)/i.exec(text)
    const status = (m?.[1] ?? "present").trim()
    const failed = /\bfail\b/i.test(status) || /\berror\b/i.test(status)
    return { status, snippet: text.replace(/\s+/g, " ").trim().slice(0, 240), failed }
  } catch {
    return null
  }
}

function alwaysOnMonitorsBlock(inbox) {
  const unanswered = (inbox.asks ?? []).filter((a) => a && a.status !== "answered")
  const running = (inbox.threads ?? []).filter((t) => t && (t.status === "planned" || t.status === "running"))
  const ready = (inbox.threads ?? []).filter((t) => t && t.status === "result_ready")
  const failed = (inbox.threads ?? []).filter((t) => t && t.status === "failed")
  return [
    "<lfg-always-on-monitors>",
    "ALWAYS keep MULTIPLE monitors open this turn (CEO). Do not close them after one glance.",
    "M1 inbox-asks     — unanswered user asks in .omo/orchestrator/inbox.json",
    "M2 result-files   — poll every thread resultPath (STATUS/SUMMARY/EVIDENCE)",
    "M3 codex-app-server — prefer live threads via `lfg --json orchestrator watch` / app-server when available",
    "M4 residual-stack — older open asks must not be dropped when new work arrives",
    "M5 user-answer    — after reply: `lfg --json orchestrator answer --ask-id … --summary …`",
    `now: unanswered=${unanswered.length} running=${running.length} ready=${ready.length} failed=${failed.length}`,
    "Before any user-facing answer: re-check M1–M4 in parallel; aggregate; then answer.",
    "</lfg-always-on-monitors>",
    "<lfg-ceo-mandatory-commands>",
    "UNCONDITIONAL — run via shell this turn (do not skip; do not \"assume\"):",
    "  lfg --json orchestrator status",
    "  lfg --json orchestrator poll",
    "Also when available: lfg --json orchestrator watch",
    "When user gave work: lfg --json orchestrator ask --text \"…\" then handoff plan --engine gpt → Codex",
    "After you reply to user: lfg --json orchestrator answer --ask-id <id> --summary \"…\"",
    "FAIL CLOSED: no status/poll this turn ⇒ no done/pass claim. No answer receipt ⇒ ask stays open.",
    "</lfg-ceo-mandatory-commands>",
  ].join("\n")
}

function stopCodexMonitorGate() {
  return [
    "<lfg-stop-codex-monitor-gate>",
    "Before the final user answer, MUST run `lfg --json orchestrator status`, `lfg --json orchestrator poll`, and `lfg --json orchestrator watch`.",
    "If any ask is open, or any thread is planned/running without a RESULT, do NOT declare done; keep monitoring Codex until RESULT is ready.",
    "When RESULT is ready, synthesize from Codex evidence only; then run `lfg --json orchestrator answer`.",
    "lazycodex means external Codex (app-server thread / handoff), not Grok self-implementation.",
    "This additionalContext is a monitor gate instruction; the host does not hard-block tools.",
    "</lfg-stop-codex-monitor-gate>",
  ].join("\n")
}

function renderContext(inbox) {
  const unanswered = (inbox.asks ?? []).filter((a) => a && a.status !== "answered")
  const running = (inbox.threads ?? []).filter((t) => t && (t.status === "planned" || t.status === "running"))
  const ready = (inbox.threads ?? []).filter((t) => t && t.status === "result_ready")
  const failed = (inbox.threads ?? []).filter((t) => t && t.status === "failed")
  const appServer = (inbox.threads ?? []).filter((t) => t && typeof t.appServerThreadId === "string")
  const monitors = alwaysOnMonitorsBlock(inbox)
  if (unanswered.length === 0 && running.length === 0 && ready.length === 0 && failed.length === 0) {
    return [
      monitors,
      "<lfg-orchestrator-inbox>",
      "CEO multi-Codex monitor: no open asks/threads yet — monitors stay ON anyway.",
      "When you hand off to Codex: register thread (lfg --json orchestrator thread register …).",
      "When you answer the user: lfg --json orchestrator answer --ask-id ID --summary \"…\".",
      "Keep M1–M5 open every turn; poll before claiming done; aggregate parallel threads.",
      "</lfg-orchestrator-inbox>",
    ].join("\n")
  }
  const lines = [
    monitors,
    "<lfg-orchestrator-inbox>",
    "CEO dashboard — multi-Codex watch + user-ask ledger (.omo/orchestrator/inbox.json).",
    `unanswered_asks=${unanswered.length} running_threads=${running.length} result_ready=${ready.length} failed=${failed.length}`,
    `M3 app_server_threads=${appServer.length}; refresh list/status with \`lfg --json orchestrator watch\`.`,
    "MUST: keep multiple monitors open; re-scan all lanes before user reply.",
    "MUST: before user-facing answer, aggregate RESULT evidence from all related threads.",
    "MUST: after answering, mark ask answered via `lfg --json orchestrator answer`.",
    "MUST NOT: invent pass/fail or drop older unanswered asks when new work arrives.",
    "APP-SERVER: prefer `lfg --json orchestrator watch` before replies; local CLI plane only, not native Grok codex_app tools.",
  ]
  const appServerThreads = (inbox.threads ?? []).filter((t) => t && typeof t.appServerThreadId === "string")
  const appServerRunning = appServerThreads.filter((t) => t.appServerStatus === "active")
  if (appServerThreads.length > 0) {
    lines.push(`running ${appServerRunning.length} threads via app-server; watched=${appServerThreads.length}`)
    for (const thr of appServerThreads.slice(0, 8)) {
      lines.push(`APP ${thr.appServerThreadId} session=${thr.appServerSessionId ?? "?"} status=${thr.appServerStatus ?? "unknown"}`)
    }
  }
  for (const ask of unanswered.slice(0, 8)) {
    lines.push(`ASK ${ask.id} status=${ask.status} text=${clip(ask.userText, 120)}`)
  }
  for (const thr of [...ready, ...failed, ...running].slice(0, 12)) {
    lines.push(
      `THR ${thr.id} status=${thr.status} role=${thr.role ?? "?"} result=${thr.resultPath}` +
        (thr.appServerStatus ? ` APP_SERVER=${thr.appServerStatus}` : "") +
        (thr.resultStatus ? ` RESULT=${thr.resultStatus}` : ""),
    )
    if (thr.resultSnippet) lines.push(`  snippet: ${clip(thr.resultSnippet, 160)}`)
  }
  lines.push("</lfg-orchestrator-inbox>")
  return lines.join("\n")
}

function statusLine(inbox) {
  const u = (inbox.asks ?? []).filter((a) => a && a.status !== "answered").length
  const r = (inbox.threads ?? []).filter((t) => t && t.status === "result_ready").length
  const run = (inbox.threads ?? []).filter((t) => t && (t.status === "planned" || t.status === "running")).length
  return `LFG orchestrator: unanswered=${u} ready=${r} running=${run}`
}

function sessionResumeStatusLine(inbox) {
  const asks = (inbox.asks ?? []).filter(
    (ask) => ask && (ask.status === "open" || ask.status === "in_progress" || ask.status === "blocked"),
  ).length
  const running = (inbox.threads ?? []).filter(
    (thread) => thread && (thread.status === "planned" || thread.status === "running"),
  ).length
  return `LFG session resume: recover ${asks} asks / ${running} running threads`
}

function firstString(record, keys) {
  if (!record || typeof record !== "object") return null
  for (const key of keys) {
    const v = record[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  return null
}

function hash(s) {
  return createHash("sha1").update(s).digest("hex")
}

function clip(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

function readStdin() {
  return new Promise((resolveP, reject) => {
    const chunks = []
    input.on("data", (c) => chunks.push(c))
    input.on("end", () => resolveP(Buffer.concat(chunks).toString("utf8")))
    input.on("error", reject)
  })
}

main().catch(() => process.exit(0))
