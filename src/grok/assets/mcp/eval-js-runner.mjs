#!/usr/bin/env node
import { createContext, runInContext } from "node:vm"
import { createInterface } from "node:readline"
import { cwd } from "node:process"

const workdir = process.env.LFG_EVAL_CWD || cwd()
process.chdir(workdir)

const consoleCapture = { stdout: "", stderr: "" }
const sandboxConsole = {
  log: (...args) => {
    consoleCapture.stdout += args.map(format).join(" ") + "\n"
  },
  info: (...args) => {
    consoleCapture.stdout += args.map(format).join(" ") + "\n"
  },
  warn: (...args) => {
    consoleCapture.stderr += args.map(format).join(" ") + "\n"
  },
  error: (...args) => {
    consoleCapture.stderr += args.map(format).join(" ") + "\n"
  },
  debug: (...args) => {
    consoleCapture.stdout += args.map(format).join(" ") + "\n"
  },
}

function format(value) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const context = createContext({
  console: sandboxConsole,
  process: { env: process.env, cwd: () => workdir },
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
  URLSearchParams,
  fetch: globalThis.fetch,
  require: undefined,
  module: undefined,
  exports: undefined,
  __dirname: workdir,
  __filename: workdir,
})

process.stdout.write(JSON.stringify({ op: "ready", ready: true }) + "\n")

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on("line", async (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (!msg || typeof msg !== "object") return
  if (msg.op === "shutdown") {
    process.exit(0)
  }
  if (msg.op !== "exec") {
    process.stdout.write(JSON.stringify({ id: msg.id, ok: false, error: "unknown op" }) + "\n")
    return
  }
  consoleCapture.stdout = ""
  consoleCapture.stderr = ""
  try {
    // Run in the shared context (not an IIFE) so const/let/var persist across cells.
    const code = String(msg.code ?? "")
    let result
    if (/\bawait\b/.test(code)) {
      result = await runInContext(`(async () => {\n${code}\n})()`, context, { filename: "eval-cell" })
    } else {
      result = runInContext(code, context, { filename: "eval-cell" })
    }
    if (result !== undefined) {
      consoleCapture.stdout += format(result) + (consoleCapture.stdout.endsWith("\n") ? "" : "\n")
    }
    process.stdout.write(
      JSON.stringify({
        id: msg.id,
        ok: true,
        stdout: consoleCapture.stdout,
        stderr: consoleCapture.stderr,
      }) + "\n",
    )
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        id: msg.id,
        ok: false,
        stdout: consoleCapture.stdout,
        stderr: consoleCapture.stderr,
        error: error instanceof Error ? error.stack || error.message : String(error),
      }) + "\n",
    )
  }
})
