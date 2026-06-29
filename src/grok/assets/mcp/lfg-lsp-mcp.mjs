#!/usr/bin/env node
import { spawn } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { argv, cwd, env, exit, execPath, platform, stdin, stdout } from "node:process"
import { fileURLToPath } from "node:url"

const PROTOCOL_VERSION = "2024-11-05"
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const TSC_TIMEOUT_MS = 20_000

const tools = [
  {
    name: "typescript_diagnostics",
    description: "Run TypeScript diagnostics with tsc --noEmit --pretty false for a project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectPath: { type: "string", minLength: 1 },
        tsconfigPath: { type: "string", minLength: 1 },
        filePath: { type: "string", minLength: 1 },
      },
      required: ["projectPath"],
    },
  },
]

if ((argv[2] ?? "mcp") !== "mcp") {
  exit(2)
}

let buffer = ""
let inputEnded = false
const pendingRequests = new Set()
stdin.setEncoding("utf8")
stdin.on("data", (chunk) => {
  buffer += chunk
  for (;;) {
    const newline = buffer.indexOf("\n")
    if (newline === -1) break
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (line.length > 0) {
      scheduleMessage(line)
    }
  }
})
stdin.on("end", () => {
  inputEnded = true
  exitWhenIdle()
})

function scheduleMessage(line) {
  const request = handleMessage(line).finally(() => {
    pendingRequests.delete(request)
    exitWhenIdle()
  })
  pendingRequests.add(request)
}

function exitWhenIdle() {
  if (inputEnded && pendingRequests.size === 0) exit(0)
}

async function handleMessage(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (!isRequest(message)) return

  if (message.method === "initialize") {
    writeResult(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "lfg-lsp", version: "0.1.0" },
    })
    return
  }
  if (message.method === "tools/list") {
    writeResult(message.id, { tools })
    return
  }
  if (message.method === "tools/call") {
    await handleToolsCall(message)
    return
  }
  writeError(message.id, -32601, "Method not found")
}

async function handleToolsCall(message) {
  const params = isObject(message.params) ? message.params : {}
  if (params.name !== "typescript_diagnostics") {
    writeError(message.id, -32602, "Unknown tool")
    return
  }
  const parsed = parseDiagnosticsArgs(params.arguments)
  if (parsed.kind === "error") {
    writeError(message.id, -32602, parsed.message)
    return
  }
  const result = await runTypeScriptDiagnostics(parsed.value)
  writeResult(message.id, {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.kind === "tool_error",
  })
}

function parseDiagnosticsArgs(value) {
  if (!isObject(value)) return { kind: "error", message: "arguments must be an object" }
  if (typeof value.projectPath !== "string" || value.projectPath.trim().length === 0) {
    return { kind: "error", message: "projectPath is required" }
  }
  const projectPath = resolvePath(value.projectPath)
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    return { kind: "error", message: "projectPath must be an existing directory" }
  }
  const tsconfigPath = typeof value.tsconfigPath === "string" && value.tsconfigPath.trim().length > 0
    ? resolvePath(value.tsconfigPath)
    : join(projectPath, "tsconfig.json")
  if (!existsSync(tsconfigPath) || !statSync(tsconfigPath).isFile()) {
    return { kind: "error", message: "tsconfigPath must be an existing file" }
  }
  const filePath = typeof value.filePath === "string" && value.filePath.trim().length > 0 ? resolvePath(value.filePath, projectPath) : null
  return { kind: "ok", value: { projectPath, tsconfigPath, filePath } }
}

async function runTypeScriptDiagnostics(args) {
  const command = findTscCommand([args.projectPath, cwd(), dirname(fileURLToPath(import.meta.url))])
  if (command === null) {
    return {
      kind: "tool_error",
      errorKind: "missing_dependency",
      diagnostics: [],
      message: "tsc was not found on PATH or in ancestor node_modules/.bin directories.",
    }
  }
  const output = await runCommand(command, ["--noEmit", "--pretty", "false", "--project", args.tsconfigPath], args.projectPath)
  if (output.kind === "spawn_error") {
    return { kind: "tool_error", errorKind: "spawn_error", diagnostics: [], message: output.message }
  }
  if (output.kind === "timeout") {
    return { kind: "tool_error", errorKind: "timeout", diagnostics: [], message: `tsc timed out after ${TSC_TIMEOUT_MS}ms` }
  }
  const diagnostics = parseTscDiagnostics(output.text, args.projectPath).filter((diagnostic) =>
    args.filePath === null ? true : resolve(diagnostic.file) === args.filePath,
  )
  if (output.exitCode !== 0 && diagnostics.length === 0) {
    return { kind: "tool_error", errorKind: "tsc_failed", diagnostics, message: output.text.trim() || `tsc exited ${output.exitCode}` }
  }
  return {
    kind: "diagnostics",
    tool: "typescript_diagnostics",
    projectPath: args.projectPath,
    tsconfigPath: args.tsconfigPath,
    diagnostics,
  }
}

function runCommand(command, args, workingDirectory) {
  return new Promise((resolveRun) => {
    const child = spawn(command.executable, [...command.prefixArgs, ...args], {
      cwd: workingDirectory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, TSC_TIMEOUT_MS)
    const append = (chunk) => {
      if (output.length < MAX_OUTPUT_BYTES) output += chunk
    }
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", append)
    child.stderr.on("data", append)
    child.on("error", (error) => {
      clearTimeout(timer)
      resolveRun({ kind: "spawn_error", message: error instanceof Error ? error.message : String(error) })
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      resolveRun(timedOut ? { kind: "timeout" } : { kind: "completed", exitCode: code ?? 1, text: output })
    })
  })
}

function parseTscDiagnostics(text, projectPath) {
  const diagnostics = []
  const pattern = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line.trim())
    if (match === null) continue
    diagnostics.push({
      file: resolve(projectPath, match[1]),
      line: Number.parseInt(match[2], 10),
      character: Number.parseInt(match[3], 10),
      severity: match[4],
      code: match[5],
      message: match[6],
    })
  }
  return diagnostics
}

function findTscCommand(starts) {
  for (const start of starts) {
    let current = start
    for (;;) {
      const candidate = join(current, "node_modules", ".bin", platform === "win32" ? "tsc.cmd" : "tsc")
      if (existsSync(candidate)) return { executable: candidate, prefixArgs: [] }
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  if (platform === "win32") return { executable: "tsc.cmd", prefixArgs: [] }
  return { executable: "tsc", prefixArgs: [] }
}

function resolvePath(path, basePath = cwd()) {
  return isAbsolute(path) ? path : resolve(basePath, path)
}

function isRequest(value) {
  return isObject(value) && "id" in value && typeof value.method === "string"
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function writeResult(id, result) {
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`)
}

function writeError(id, code, message) {
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`)
}
