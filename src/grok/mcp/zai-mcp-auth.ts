import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { isRecord } from "../../shared/json"
import { resolveGrokSetupHome } from "../install/grok-home"

export const ZAI_MCP_AUTH_BASENAME = "zai-mcp-auth.json" as const
export const ZAI_MCP_AUTH_FILE_ENV = "LFG_ZAI_MCP_AUTH_FILE" as const
export const ZAI_MODES = ["ZAI", "ZHIPU"] as const
export type ZaiMode = (typeof ZAI_MODES)[number]

export type ZaiMcpAuthRecord = {
  readonly apiKey: string
  readonly mode: ZaiMode
  readonly updatedAt: string
}

export function resolveZaiMcpAuthPath(env: NodeJS.ProcessEnv = process.env, home: string = resolveGrokSetupHome(env)): string {
  const override = env[ZAI_MCP_AUTH_FILE_ENV]?.trim()
  if (override !== undefined && override.length > 0) return override
  return join(home, ".grok", ZAI_MCP_AUTH_BASENAME)
}

export function parseZaiMode(value: unknown): ZaiMode | null {
  if (value === "ZAI" || value === "ZHIPU") return value
  if (typeof value !== "string") return null
  const normalized = value.trim().toUpperCase()
  if (normalized === "ZAI" || normalized === "ZHIPU") return normalized
  return null
}

export async function readZaiMcpAuth(path: string): Promise<ZaiMcpAuthRecord | null> {
  try {
    const raw = await readFile(path, "utf8")
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || typeof data.apiKey !== "string" || data.apiKey.trim().length === 0) return null
    const mode = parseZaiMode(data.mode) ?? "ZAI"
    return {
      apiKey: data.apiKey.trim(),
      mode,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null
    return null
  }
}

export async function writeZaiMcpApiKey(path: string, apiKey: string, mode: ZaiMode = "ZAI"): Promise<void> {
  const key = apiKey.trim()
  if (key.length === 0) throw new Error("Z.AI API key must be non-empty")
  const body = `${JSON.stringify({ provider: "lfg-zai-mcp", apiKey: key, mode, updatedAt: new Date().toISOString() }, null, 2)}\n`
  await writeAuthFile(path, body)
}

export async function clearZaiMcpAuth(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return
    throw error
  }
}

export async function resolveZaiApiKey(
  env: NodeJS.ProcessEnv = process.env,
  home: string = resolveGrokSetupHome(env),
): Promise<{ readonly apiKey: string; readonly mode: ZaiMode; readonly source: "file" | "env" } | null> {
  const path = resolveZaiMcpAuthPath(env, home)
  const fromFile = await readZaiMcpAuth(path)
  if (fromFile !== null) {
    return { apiKey: fromFile.apiKey, mode: fromFile.mode, source: "file" }
  }
  const fromEnv = env.Z_AI_API_KEY?.trim()
  if (fromEnv !== undefined && fromEnv.length > 0) {
    const mode = parseZaiMode(env.Z_AI_MODE) ?? "ZAI"
    return { apiKey: fromEnv, mode, source: "env" }
  }
  return null
}

export async function getZaiMcpAuthStatus(env: NodeJS.ProcessEnv = process.env): Promise<{
  readonly ok: boolean
  readonly authFile: string
  readonly mode: ZaiMode | null
  readonly source: "file" | "env" | "none"
  readonly message: string
}> {
  const home = resolveGrokSetupHome(env)
  const authFile = resolveZaiMcpAuthPath(env, home)
  const resolved = await resolveZaiApiKey(env, home)
  if (resolved === null) {
    return {
      ok: false,
      authFile,
      mode: null,
      source: "none",
      message: "No Z.AI API key. Run `lfg zai auth set-api-key` or set Z_AI_API_KEY.",
    }
  }
  return {
    ok: true,
    authFile,
    mode: resolved.mode,
    source: resolved.source,
    message:
      resolved.source === "file"
        ? "Using dedicated ~/.grok/zai-mcp-auth.json credentials."
        : "Using Z_AI_API_KEY from environment.",
  }
}

async function writeAuthFile(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await rejectUnsafeExistingAuthPath(path)
  await writeFile(path, body, { encoding: "utf8", mode: 0o600 })
  await chmod(path, 0o600)
}

async function rejectUnsafeExistingAuthPath(path: string): Promise<void> {
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) {
      throw new Error("Refusing to write Z.AI MCP auth through a symbolic link")
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
