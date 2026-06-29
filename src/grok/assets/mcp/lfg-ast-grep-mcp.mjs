#!/usr/bin/env node
import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access, readdir, readFile, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { argv, env, stdin, stdout, stderr } from "node:process"

const TOOL_NAME = "ast_grep_search"
const VERSION = "0.1.0"
const SUPPORTED_FALLBACK_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"])
const PATH_ERROR_CODES = new Set(["EACCES", "ENOENT", "ENOTDIR", "EPERM"])

if ((argv[2] ?? "mcp") !== "mcp") { stderr.write("lfg ast_grep runtime supports only the mcp subcommand\n"); process.exit(2) }

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
stdin.on("end", () => { void pending.then(() => process.exit(0)) })

async function handleMessage(line) {
  let message
  try { message = JSON.parse(line) } catch { return }
  if (!isRecord(message) || !("id" in message)) return
  if (message.method === "initialize") {
    writeResponse(message.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lfg-ast_grep", version: VERSION } })
    return
  }
  if (message.method === "tools/list") { writeResponse(message.id, { tools: [astGrepSearchTool()] }); return }
  if (message.method === "tools/call") { await handleToolCall(message); return }
  writeError(message.id, -32601, "Method not found")
}

async function handleToolCall(message) {
  const params = isRecord(message.params) ? message.params : null
  if (params === null || params.name !== TOOL_NAME) {
    writeError(message.id, -32602, "Unknown tool", { kind: "unknown_tool", tool: params?.name ?? null })
    return
  }
  const parsed = parseSearchArguments(params.arguments)
  if (parsed.kind === "error") { writeError(message.id, -32602, parsed.message, { kind: parsed.errorKind }); return }
  const syntax = validatePattern(parsed.value.pattern)
  if (syntax !== null) { writeError(message.id, -32602, syntax, { kind: "malformed_pattern" }); return }
  const result = await search(parsed.value)
  if (result.kind === "error") { writeError(message.id, result.code, result.message, { kind: result.errorKind, detail: result.detail }); return }
  writeResponse(message.id, { content: [{ type: "text", text: JSON.stringify(result.value) }], structuredContent: result.value })
}

async function search(args) {
  const pathError = await validateSearchPath(args.path)
  if (pathError !== null) return pathError
  const sgResult = await runAstGrep(args)
  if (sgResult && sgResult.oversized) {
    return { kind: "error", code: -32000, errorKind: "output_too_large", message: "ast-grep child output exceeded size limit", detail: "stdout/stderr bounded to 1MiB" }
  }
  if (sgResult.kind === "ok") return { kind: "ok", value: sgResult.value }
  if (sgResult.errorKind !== "missing_binary") return sgResult
  return fallbackSearch(args)
}

async function validateSearchPath(path) {
  try {
    await access(path, constants.R_OK)
    await stat(path)
    return null
  } catch (error) {
    return invalidPathError(error)
  }
}

async function runAstGrep(args) {
  const commands = ["sg", "ast-grep"]
  for (const command of commands) {
    const argsForSg = ["run", "-p", args.pattern, "--json=compact"]
    if (args.language !== null) argsForSg.push("--lang", args.language)
    argsForSg.push(args.path)
    const result = await runCommand(command, argsForSg)
    if (result && result.oversized) {
      return { kind: "error", code: -32000, errorKind: "output_too_large", message: "ast-grep child output exceeded size limit", detail: "stdout/stderr bounded to 1MiB" }
    }
    if (result.missing) continue
    if (result.stderr.includes("ERROR node")) {
      return { kind: "error", code: -32602, errorKind: "malformed_pattern", message: "Pattern contains an ERROR node", detail: result.stderr.trim() }
    }
    if (result.code !== 0) {
      return { kind: "error", code: -32000, errorKind: "search_failed", message: "ast-grep search failed", detail: result.stderr.trim() }
    }
    try {
      const parsed = result.stdout.trim().length === 0 ? [] : JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) return { kind: "error", code: -32000, errorKind: "invalid_output", message: "ast-grep returned non-array JSON", detail: result.stdout.slice(0, 500) }
      return { kind: "ok", value: { engine: "sg", pattern: args.pattern, path: args.path, matches: parsed.slice(0, args.maxResults).map(normalizeSgMatch) } }
    } catch (error) {
      return { kind: "error", code: -32000, errorKind: "invalid_output", message: "ast-grep returned invalid JSON", detail: error instanceof Error ? error.message : String(error) }
    }
  }
  return { kind: "error", code: -32000, errorKind: "missing_binary", message: "ast-grep binary not found", detail: "Falling back to the built-in JavaScript/TypeScript call-expression matcher." }
}

async function fallbackSearch(args) {
  const parsedPattern = parseCallPattern(args.pattern)
  if (parsedPattern === null) return { kind: "error", code: -32602, errorKind: "unsupported_pattern", message: "Built-in fallback supports only simple JS/TS call-expression patterns", detail: args.pattern }
  let files
  try { files = await collectFiles(args.path, args.language) } catch (error) { return invalidPathError(error) }
  const matches = []
  for (const file of files) {
    let text
    try { text = await readFile(file, "utf8") } catch (error) { return invalidPathError(error) }
    for (const match of findCallMatches(file, text, parsedPattern)) {
      matches.push(match)
      if (matches.length >= args.maxResults) break
    }
    if (matches.length >= args.maxResults) break
  }
  return { kind: "ok", value: { engine: "fallback-js-call-expression", limitations: "Uses a deterministic call-expression matcher when sg is unavailable; install ast-grep for full structural matching.", pattern: args.pattern, path: args.path, matches } }
}

function parseSearchArguments(value) {
  if (!isRecord(value)) return { kind: "error", errorKind: "invalid_arguments", message: "arguments must be an object" }
  if (typeof value.path !== "string" || value.path.trim().length === 0) return { kind: "error", errorKind: "invalid_arguments", message: "arguments.path must be a non-empty string" }
  if (typeof value.pattern !== "string" || value.pattern.trim().length === 0) return { kind: "error", errorKind: "invalid_arguments", message: "arguments.pattern must be a non-empty string" }
  const language = typeof value.language === "string" && value.language.trim().length > 0 ? value.language.trim() : null
  const maxResults = typeof value.maxResults === "number" && Number.isInteger(value.maxResults) && value.maxResults > 0 ? Math.min(value.maxResults, 500) : 100
  return { kind: "ok", value: { path: value.path, pattern: value.pattern, language, maxResults } }
}

function validatePattern(pattern) {
  const stack = []
  let quote = null
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    const previous = pattern[index - 1]
    if (quote !== null) {
      if (char === quote && previous !== "\\") quote = null
      continue
    }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue }
    if (char === "(" || char === "{" || char === "[") stack.push(char)
    if (char === ")" || char === "}" || char === "]") {
      const open = stack.pop()
      if ((char === ")" && open !== "(") || (char === "}" && open !== "{") || (char === "]" && open !== "[")) return "Pattern has unmatched delimiters"
    }
  }
  if (quote !== null) return "Pattern has an unterminated string"
  if (stack.length > 0) return "Pattern has unmatched delimiters"
  return null
}

function parseCallPattern(pattern) {
  const match = /^\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(pattern)
  if (match === null) return null
  return { callee: match[1], arguments: match[2].trim() }
}

async function collectFiles(path, language) {
  const info = await stat(path)
  if (info.isFile()) return [path]
  const files = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue
    const child = join(path, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(child, language))
    else if (entry.isFile() && isSupportedFile(entry.name, language)) files.push(child)
  }
  return files
}

function invalidPathError(error) {
  if (!isPathError(error)) throw error
  return { kind: "error", code: -32602, errorKind: "invalid_path", message: "Search path is missing or unreadable", detail: error instanceof Error ? error.message : String(error) }
}

function isPathError(error) {
  return isRecord(error) && typeof error.code === "string" && PATH_ERROR_CODES.has(error.code)
}

function isSupportedFile(name, language) {
  if (language === null) return [...SUPPORTED_FALLBACK_EXTENSIONS].some((ext) => name.endsWith(ext))
  const normalized = language.toLowerCase()
  if (normalized === "ts" || normalized === "typescript") return [".ts", ".tsx", ".mts", ".cts"].some((ext) => name.endsWith(ext))
  if (normalized === "js" || normalized === "javascript") return [".js", ".jsx", ".mjs", ".cjs"].some((ext) => name.endsWith(ext))
  return [...SUPPORTED_FALLBACK_EXTENSIONS].some((ext) => name.endsWith(ext))
}

function findCallMatches(file, text, pattern) {
  const matches = []
  let index = 0
  while ((index = text.indexOf(pattern.callee, index)) !== -1) {
    const afterCallee = skipWhitespace(text, index + pattern.callee.length)
    if (text[afterCallee] === "(" && hasIdentifierBoundary(text, index, pattern.callee.length)) {
      const close = findClosingParen(text, afterCallee)
      if (close !== -1) {
        const args = text.slice(afterCallee + 1, close).trim()
        if (pattern.arguments.includes("$") || args === pattern.arguments) matches.push(matchForRange(file, text, index, close + 1))
      }
    }
    index += pattern.callee.length
  }
  return matches
}

function matchForRange(file, text, start, end) {
  const prefix = text.slice(0, start)
  return { file, text: text.slice(start, end), range: { start: positionFromPrefix(prefix), end: positionAt(text, end) } }
}

function positionAt(text, offset) {
  return positionFromPrefix(text.slice(0, offset))
}

function positionFromPrefix(prefix) {
  const line = prefix.split("\n").length - 1
  return { line, column: prefix.length - prefix.lastIndexOf("\n") - 1 }
}

function skipWhitespace(text, index) {
  let cursor = index
  while (/\s/.test(text[cursor] ?? "")) cursor++
  return cursor
}

function hasIdentifierBoundary(text, start, length) {
  return !/[A-Za-z0-9_$]/.test(text[start - 1] ?? "") && !/[A-Za-z0-9_$]/.test(text[start + length] ?? "")
}

function findClosingParen(text, open) {
  let depth = 0
  let quote = null
  for (let index = open; index < text.length; index++) {
    const char = text[index]
    const previous = text[index - 1]
    if (quote !== null) {
      if (char === quote && previous !== "\\") quote = null
      continue
    }
    if (char === "\"" || char === "'" || char === "`") { quote = char; continue }
    if (char === "(") depth++
    if (char === ")") depth--
    if (depth === 0) return index
  }
  return -1
}

function normalizeSgMatch(match) {
  return { file: isRecord(match) && typeof match.file === "string" ? match.file : "", text: isRecord(match) && typeof match.text === "string" ? match.text : "", range: isRecord(match) ? match.range ?? null : null, language: isRecord(match) && typeof match.language === "string" ? match.language : null, metaVariables: isRecord(match) ? match.metaVariables ?? null : null }
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    let outBytes = 0
    let errBytes = 0
    const MAX_BYTES = 1 * 1024 * 1024
    let killedOversized = false
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: null, stdout: out, stderr: "ast-grep search timed out", missing: false })
    }, 10_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      if (killedOversized) return
      const add = Buffer.byteLength(chunk, "utf8")
      if (outBytes + add > MAX_BYTES) {
        killedOversized = true
        child.kill("SIGKILL")
        return
      }
      out += chunk
      outBytes += add
    })
    child.stderr.on("data", (chunk) => {
      if (killedOversized) return
      const add = Buffer.byteLength(chunk, "utf8")
      if (errBytes + add > MAX_BYTES) {
        killedOversized = true
        child.kill("SIGKILL")
        return
      }
      err += chunk
      errBytes += add
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ code: null, stdout: out, stderr: error instanceof Error ? error.message : String(error), missing: error?.code === "ENOENT" })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: out, stderr: err, missing: false, oversized: killedOversized })
    })
  })
}

function astGrepSearchTool() {
  return { name: TOOL_NAME, description: "Search JavaScript/TypeScript or ast-grep-supported code structurally with an ast-grep pattern.", inputSchema: { type: "object", additionalProperties: false, required: ["path", "pattern"], properties: { path: { type: "string", description: "File or directory to search." }, pattern: { type: "string", description: "ast-grep structural pattern, for example console.log($MSG)." }, language: { type: "string", description: "Optional ast-grep language such as ts, tsx, js, or python." }, maxResults: { type: "integer", minimum: 1, maximum: 500 } } } }
}

function writeResponse(id, result) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
}

function writeError(id, code, message, data = undefined) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } }) + "\n")
}

function isRecord(value) {
  return typeof value === "object" && value !== null
}
