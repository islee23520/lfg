#!/usr/bin/env node
/**
 * lfg-eval-mcp — Grok-adapted "code mode" (omp/senpi eval analog).
 *
 * Tools:
 *   eval       — run one cell in a persistent language kernel (js | py)
 *   eval_reset — wipe kernel state for a language (or all)
 *
 * One eval call = one logical step. State persists per (cwd, language) across
 * tool calls within this MCP process lifetime (session-scoped).
 */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { argv, cwd, env, stdin, stdout, stderr, execPath } from "node:process"

const VERSION = "0.1.0"
const SERVER_NAME = "lfg-eval"
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_OUTPUT_CHARS = 80_000
const SUPPORTED = new Set(["js", "py"])

if ((argv[2] ?? "mcp") !== "mcp") {
  stderr.write("lfg eval runtime supports only the mcp subcommand\n")
  process.exit(2)
}

/** @type {Map<string, KernelHandle>} */
const kernels = new Map()

let buffer = ""
let pending = Promise.resolve()
stdin.setEncoding("utf8")
stdin.on("data", (chunk) => {
  buffer += chunk
  for (;;) {
    const newline = buffer.indexOf("\n")
    if (newline === -1) break
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (line.length > 0) pending = pending.then(() => handleMessage(line))
  }
})
stdin.on("end", () => {
  void pending.then(async () => {
    await disposeAllKernels()
    process.exit(0)
  })
})

/**
 * @typedef {{
 *   language: string,
 *   cwd: string,
 *   child: import("node:child_process").ChildProcess,
 *   queue: Promise<unknown>,
 *   alive: boolean,
 *   buf: string,
 *   waiters: Map<string, { resolve: (v: unknown) => void, reject: (e: Error) => void }>,
 *   ready: Promise<void>,
 *   resolveReady: () => void,
 * }} KernelHandle
 */

async function handleMessage(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (!isRecord(message) || !("id" in message)) return
  if (message.method === "initialize") {
    writeResponse(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: VERSION },
    })
    return
  }
  if (message.method === "notifications/initialized") return
  if (message.method === "tools/list") {
    writeResponse(message.id, { tools: [evalTool(), evalResetTool()] })
    return
  }
  if (message.method === "tools/call") {
    await handleToolCall(message)
    return
  }
  writeError(message.id, -32601, "Method not found")
}

async function handleToolCall(message) {
  const params = isRecord(message.params) ? message.params : null
  const name = typeof params?.name === "string" ? params.name : ""
  const args = isRecord(params?.arguments) ? params.arguments : {}
  try {
    if (name === "eval") {
      const result = await runEval(args)
      writeResponse(message.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: result.ok === false,
      })
      return
    }
    if (name === "eval_reset") {
      const result = await runEvalReset(args)
      writeResponse(message.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      })
      return
    }
    writeError(message.id, -32602, "Unknown tool", { kind: "unknown_tool", tool: name || null })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    writeError(message.id, -32000, "eval runtime failure", { kind: "runtime_error", detail })
  }
}

function evalTool() {
  return {
    name: "eval",
    description:
      "Run one code cell in a persistent kernel (code mode). State survives across eval calls per language for the session. Prefer eval over bash for multi-step compute, loops, dataframes, and incremental experimentation. Languages: js (Node VM worker), py (Python subprocess).",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["js", "py"],
          description: 'Kernel language: "js" or "py"',
        },
        code: {
          type: "string",
          description: "Cell body, verbatim. One logical step per call.",
        },
        title: {
          type: "string",
          description: "Optional short label for the cell (transcript only).",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default 30).",
        },
        reset: {
          type: "boolean",
          description: "If true, wipe this language kernel before running the cell.",
        },
        cwd: {
          type: "string",
          description: "Working directory for the kernel (default: process cwd).",
        },
      },
      required: ["language", "code"],
      additionalProperties: false,
    },
  }
}

function evalResetTool() {
  return {
    name: "eval_reset",
    description: "Reset persistent eval kernel state for one language or all languages.",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["js", "py", "all"],
          description: 'Language to reset, or "all" (default).',
        },
        cwd: {
          type: "string",
          description: "Working directory key (default: process cwd).",
        },
      },
      additionalProperties: false,
    },
  }
}

async function runEval(args) {
  const language = String(args.language ?? "").trim().toLowerCase()
  if (!SUPPORTED.has(language)) {
    return {
      ok: false,
      error: `Unsupported language "${language}". Enabled: js, py`,
      kind: "unsupported_language",
    }
  }
  const code = typeof args.code === "string" ? args.code : ""
  if (code.trim().length === 0) {
    return { ok: false, error: "code must be a non-empty string", kind: "invalid_arguments" }
  }
  const workdir = resolveCwd(args.cwd)
  const timeoutMs = resolveTimeoutMs(args.timeout)
  const title = typeof args.title === "string" ? args.title : null
  const reset = args.reset === true

  if (reset) await disposeKernel(kernelKey(workdir, language))

  const result = await executeInKernel({ language, code, workdir, timeoutMs })
  return {
    ok: result.ok,
    language,
    title,
    cwd: workdir,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    error: result.error,
    durationMs: result.durationMs,
    reset,
  }
}

async function runEvalReset(args) {
  const workdir = resolveCwd(args.cwd)
  const language = String(args.language ?? "all").trim().toLowerCase()
  const resetLangs =
    language === "all" ? ["js", "py"] : SUPPORTED.has(language) ? [language] : null
  if (resetLangs === null) {
    return { ok: false, error: `Unsupported language "${language}"`, kind: "unsupported_language" }
  }
  for (const lang of resetLangs) {
    await disposeKernel(kernelKey(workdir, lang))
  }
  return { ok: true, cwd: workdir, reset: resetLangs }
}

/**
 * @param {{ language: string, code: string, workdir: string, timeoutMs: number }} input
 */
async function executeInKernel(input) {
  const key = kernelKey(input.workdir, input.language)
  const handle = await ensureKernel(key, input.language, input.workdir)
  const started = Date.now()
  try {
    const payload = await withTimeout(sendKernel(handle, { op: "exec", code: input.code }), input.timeoutMs)
    return {
      ok: payload.ok === true,
      stdout: String(payload.stdout ?? ""),
      stderr: String(payload.stderr ?? ""),
      error: payload.ok === true ? null : String(payload.error ?? "cell failed"),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    // Kernel may be dead; drop it so the next call restarts cleanly.
    await disposeKernel(key)
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: message,
      durationMs: Date.now() - started,
    }
  }
}

/**
 * @param {string} key
 * @param {string} language
 * @param {string} workdir
 * @returns {Promise<KernelHandle>}
 */
async function ensureKernel(key, language, workdir) {
  const existing = kernels.get(key)
  if (existing && existing.alive && existing.child.exitCode === null) return existing

  if (existing) await disposeKernel(key)

  const runnerPath = writeRunnerScript(language)
  /** @type {(() => void) | null} */
  let resolveReadyFn = null
  const ready = new Promise((resolve) => {
    resolveReadyFn = resolve
  })

  const child =
    language === "js"
      ? spawn(execPath, [runnerPath], {
          cwd: workdir,
          env: { ...env, LFG_EVAL_CWD: workdir },
          stdio: ["pipe", "pipe", "pipe"],
        })
      : spawn(pythonBinary(), [runnerPath], {
          cwd: workdir,
          env: { ...env, LFG_EVAL_CWD: workdir, PYTHONUNBUFFERED: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        })

  /** @type {KernelHandle} */
  const handle = {
    language,
    cwd: workdir,
    child,
    queue: Promise.resolve(),
    alive: true,
    buf: "",
    waiters: new Map(),
    ready,
    resolveReady: resolveReadyFn ?? (() => {}),
  }

  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  // Attach immediately so the ready handshake cannot be missed.
  child.stdout?.on("data", (chunk) => onKernelStdout(handle, chunk))
  child.on("error", () => {
    handle.alive = false
    kernels.delete(key)
  })
  child.on("exit", () => {
    handle.alive = false
    kernels.delete(key)
    for (const [, waiter] of handle.waiters) waiter.reject(new Error("kernel exited"))
    handle.waiters.clear()
  })

  kernels.set(key, handle)
  await withTimeout(handle.ready, 10_000)
  return handle
}

/**
 * @param {KernelHandle} handle
 * @param {string} chunk
 */
function onKernelStdout(handle, chunk) {
  handle.buf += chunk
  for (;;) {
    const nl = handle.buf.indexOf("\n")
    if (nl === -1) break
    const line = handle.buf.slice(0, nl).trim()
    handle.buf = handle.buf.slice(nl + 1)
    if (line.length === 0) continue
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(parsed)) continue
    if (parsed.ready === true || parsed.op === "ready") {
      handle.resolveReady()
      continue
    }
    const id = typeof parsed.id === "string" || typeof parsed.id === "number" ? String(parsed.id) : ""
    if (id.length === 0) continue
    const waiter = handle.waiters.get(id)
    if (waiter) {
      handle.waiters.delete(id)
      waiter.resolve(parsed)
    }
  }
}

/**
 * @param {KernelHandle} handle
 * @param {Record<string, unknown>} message
 */
function sendKernel(handle, message) {
  handle.queue = handle.queue.then(() => sendKernelOnce(handle, message))
  return handle.queue
}

/**
 * @param {KernelHandle} handle
 * @param {Record<string, unknown>} message
 */
function sendKernelOnce(handle, message) {
  return new Promise((resolve, reject) => {
    if (!handle.alive || !handle.child.stdin) {
      reject(new Error("kernel is not alive"))
      return
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    handle.waiters.set(id, { resolve, reject })
    handle.child.stdin.write(`${JSON.stringify({ ...message, id })}\n`, (err) => {
      if (err) {
        handle.waiters.delete(id)
        reject(err)
      }
    })
  })
}

async function disposeKernel(key) {
  const handle = kernels.get(key)
  if (!handle) return
  kernels.delete(key)
  handle.alive = false
  try {
    handle.child.stdin?.write(`${JSON.stringify({ id: "shutdown", op: "shutdown" })}\n`)
  } catch {
    // ignore
  }
  handle.child.kill("SIGTERM")
  await new Promise((r) => setTimeout(r, 50))
  if (handle.child.exitCode === null) handle.child.kill("SIGKILL")
}

async function disposeAllKernels() {
  const keys = [...kernels.keys()]
  for (const key of keys) await disposeKernel(key)
}

function writeRunnerScript(language) {
  const dir = join(tmpdir(), "lfg-eval-runners")
  mkdirSync(dir, { recursive: true })
  if (language === "js") {
    const path = join(dir, "js-runner.mjs")
    writeFileSync(path, readRunnerAsset("eval-js-runner.mjs"), "utf8")
    return path
  }
  const path = join(dir, "py-runner.py")
  writeFileSync(path, readRunnerAsset("eval-py-runner.py"), "utf8")
  return path
}

function readRunnerAsset(fileName) {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, fileName),
    join(here, "mcp", fileName),
    join(here, "..", "assets", "mcp", fileName),
  ]
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8")
    } catch {
      // keep looking
    }
  }
  throw new Error(`lfg eval runner asset missing: ${fileName}`)
}
function pythonBinary() {
  return env.LFG_EVAL_PYTHON || env.PYTHON || "python3"
}

function kernelKey(workdir, language) {
  const hash = createHash("sha1").update(workdir).digest("hex").slice(0, 12)
  return `${language}:${hash}`
}

function resolveCwd(value) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  return env.LFG_EVAL_CWD || cwd()
}

function resolveTimeoutMs(timeoutSec) {
  if (typeof timeoutSec === "number" && Number.isFinite(timeoutSec) && timeoutSec > 0) {
    return Math.min(Math.floor(timeoutSec * 1000), 10 * 60 * 1000)
  }
  return DEFAULT_TIMEOUT_MS
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…[truncated ${text.length - MAX_OUTPUT_CHARS} chars]`
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`eval timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function writeResponse(id, result) {
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`)
}

function writeError(id, code, message, data) {
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } })}\n`)
}
