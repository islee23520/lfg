import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { JsonObject } from "../../shared/json"

const COMPANION_PACKAGE = "@islee23520/lfg-mcp"
const COMPANION_BIN = "lfg-mcp"

/**
 * Optional bridge to the independent lfg-mcp companion plugin.
 * Prefer a local ULW checkout when present; otherwise npx the published package.
 */
export async function dispatchMcpCompanionCommand(
  action: string | undefined,
  options: { readonly json: boolean; readonly rest?: readonly string[] },
): Promise<JsonObject | string> {
  const cmd = action ?? "status"
  if (cmd === "help" || cmd === "--help") {
    return companionHelp()
  }

  if (cmd === "status" || cmd === "doctor") {
    return runCompanion(["doctor", ...(options.json ? ["--json"] : [])], options.json)
  }
  if (cmd === "install" || cmd === "setup") {
    const packages = options.rest && options.rest.length > 0 ? options.rest.join(",") : "all"
    return runCompanion(
      ["setup", "--packages", packages, ...(options.json ? ["--json"] : [])],
      options.json,
    )
  }
  if (cmd === "uninstall" || cmd === "remove") {
    return runCompanion(["uninstall", ...(options.json ? ["--json"] : [])], options.json)
  }

  return options.json
    ? {
        ok: false,
        status: "mcp_companion_unknown",
        error: `Unknown companion action "${cmd}"`,
        supported: ["status", "install", "uninstall", "help"],
        companionPackage: COMPANION_PACKAGE,
      }
    : `Unknown action "${cmd}".\n${companionHelp()}`
}

function companionHelp(): string {
  return [
    "lfg mcp companion — optional bridge to independent @islee23520/lfg-mcp",
    "",
    "  lfg mcp companion status",
    "  lfg mcp companion install [all|xai]",
    "  lfg mcp companion uninstall",
    "",
    "Direct (without lfg):",
    `  npx ${COMPANION_PACKAGE} setup`,
    `  npx ${COMPANION_PACKAGE} doctor`,
    "",
    "Note: core lfg already installs built-in xai_grok MCP (Grok enhanced web/X search)",
    "via `lfg setup --run` → [mcp_servers.xai_grok] (codex-xai-oauth equivalent for GrokBuild).",
    "Use companion when you want a separate lfg-mcp plugin tree.",
  ].join("\n")
}

function runCompanion(args: readonly string[], json: boolean): JsonObject | string {
  const local = resolveLocalCompanionCli()
  let result
  if (local !== null) {
    result = spawnSync(process.execPath, [local, ...args], {
      encoding: "utf8",
      env: process.env,
    })
  } else {
    result = spawnSync("npx", ["-y", COMPANION_PACKAGE, ...args], {
      encoding: "utf8",
      env: process.env,
    })
  }

  const stdout = result.stdout?.trim() ?? ""
  const stderr = result.stderr?.trim() ?? ""
  if (result.error) {
    const message = `Failed to run ${COMPANION_PACKAGE}: ${result.error.message}. Install or publish the companion, or clone ULW/lfg-mcp.`
    return json
      ? { ok: false, status: "mcp_companion_spawn_failed", error: message, companionPackage: COMPANION_PACKAGE }
      : message
  }
  if (json) {
    try {
      return JSON.parse(stdout) as JsonObject
    } catch {
      return {
        ok: result.status === 0,
        status: result.status === 0 ? "mcp_companion_ok" : "mcp_companion_failed",
        exitCode: result.status ?? 1,
        stdout,
        stderr,
        companionPackage: COMPANION_PACKAGE,
        runner: local !== null ? "local-checkout" : "npx",
      }
    }
  }
  if (stdout.length > 0) return stdout
  if (stderr.length > 0) return stderr
  return result.status === 0 ? "ok" : `companion exited ${result.status}`
}

function resolveLocalCompanionCli(): string | null {
  // Prefer sibling checkout: .../ULW/lfg + .../ULW/lfg-mcp
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "..", "..", "..", "..", "lfg-mcp", "bin", "lfg-mcp.js"),
    join(process.cwd(), "..", "lfg-mcp", "bin", "lfg-mcp.js"),
    join(process.cwd(), "lfg-mcp", "bin", "lfg-mcp.js"),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  // PATH binary
  const which = spawnSync("which", [COMPANION_BIN], { encoding: "utf8" })
  if (which.status === 0 && which.stdout.trim().length > 0) {
    // return null to force node on package bin via npx when only name is known
  }
  return null
}
