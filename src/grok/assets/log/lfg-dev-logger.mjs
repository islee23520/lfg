/**
 * lfg-dev-logger.mjs
 *
 * Lightweight append-only dev logger for lfg hooks and install paths.
 * Activated ONLY when:
 *   - LFG_DEV_LOG=1 (env var), OR
 *   - ~/.grok/lfg-config.jsonc has `"dev_log": true`
 *
 * Writes JSONL entries to ~/.grok/logs/lfg-dev.log.
 * No-op when disabled (zero overhead, safe for production).
 *
 * Never logs API keys or auth tokens.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".grok", "logs");
const LOG_FILE = join(LOG_DIR, "lfg-dev.log");
const CONFIG_FILE = join(homedir(), ".grok", "lfg-config.jsonc");

let _enabled = null;

/**
 * Returns true if dev logging is active.
 * Checks env var first, then config file. Result is cached.
 */
export async function isDevLogEnabled() {
  if (_enabled !== null) return _enabled;
  const envFlag = process.env.LFG_DEV_LOG;
  if (envFlag === "1" || envFlag === "true") {
    _enabled = true;
    return true;
  }
  try {
    const raw = await readFileSafe(CONFIG_FILE);
    if (raw === null) {
      _enabled = false;
      return false;
    }
    // Strip JSONC comments before parsing
    const stripped = stripJsonComments(raw);
    const parsed = JSON.parse(stripped);
    _enabled = parsed?.dev_log === true;
  } catch {
    _enabled = false;
  }
  return _enabled;
}

/**
 * Append a log entry. No-op when dev logging is disabled.
 *
 * @param {object} entry - { event, hook?, agent?, model?, cwd?, source?, detail?, durationMs?, ... }
 */
export async function devLog(entry) {
  if (!(await isDevLogEnabled())) return;
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      ...entry,
    }) + "\n";
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Logging must never break hook execution
  }
}

/** Returns the resolved log file path (for doctor/diagnostics). */
export function getDevLogPath() {
  return LOG_FILE;
}

async function readFileSafe(path) {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function stripJsonComments(text) {
  // Remove single-line // comments and block /* */ comments
  // (JSONC support — simple, not perfect, but covers common cases)
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
