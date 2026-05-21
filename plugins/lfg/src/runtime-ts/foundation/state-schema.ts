import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveLfgEnv, type LfgEnv } from "./env"

export const STATE_SCHEMA_VERSION = 2
export const STATE_SCHEMA_ROOTS = ["state", "boulder", "notepads", "mailbox", "tasklists", "teams", "wiki", "plans", "ultragoal", "hyperplan", "dispatch-gate"] as const
export const STATE_BOOTSTRAP_DIRS = ["state", "runs", "plans", "boulder", "notepads", "mailbox", "tasklists", "teams", "wiki", "evidence", "hyperplan", "dispatch-gate", "agents"] as const

export type StateSchemaRoot = typeof STATE_SCHEMA_ROOTS[number]
export type StateSchema = {
  name: "lfg-state"
  version: number
  createdAt: string
  updatedAt: string
  stateDir: string
  runsDir: string
  migrations: StateMigration[]
  migrationStatus: "current" | "migrated"
  roots: StateSchemaRoot[]
}

export type StateMigration = {
  id: string
  ts: string
  from: number | null
  to: number
  status: "applied"
}

export type StateDoctorResult = {
  ok: boolean
  schemaPath: string
  schemaVersion: number | null
  missingDirectories: string[]
  missingRoots: string[]
}

export async function bootstrapState(env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<StateSchema> {
  await Promise.all(STATE_BOOTSTRAP_DIRS.map((dir) => mkdir(join(env.data, dir), { recursive: true })))
  return ensureStateSchema(env, now)
}

export async function ensureStateSchema(env: LfgEnv = resolveLfgEnv(), now: () => string = utcNow): Promise<StateSchema> {
  await mkdir(env.stateDir, { recursive: true })
  const path = stateSchemaPath(env)
  const current = await readJsonObject(path)
  const previous = typeof current.version === "number" ? current.version : null
  const existingMigrations = Array.isArray(current.migrations) ? current.migrations.filter(isStateMigration) : []
  const migrations = [...existingMigrations]
  if (previous !== STATE_SCHEMA_VERSION) {
    const id = `state-schema-v${previous ?? 0}-to-v${STATE_SCHEMA_VERSION}`
    if (!migrations.some((migration) => migration.id === id)) migrations.push({ id, ts: now(), from: previous, to: STATE_SCHEMA_VERSION, status: "applied" })
  }
  const schema: StateSchema = {
    name: "lfg-state",
    version: STATE_SCHEMA_VERSION,
    createdAt: typeof current.createdAt === "string" ? current.createdAt : now(),
    updatedAt: now(),
    stateDir: env.stateDir,
    runsDir: env.runsDir,
    migrations,
    migrationStatus: previous === STATE_SCHEMA_VERSION ? "current" : "migrated",
    roots: [...STATE_SCHEMA_ROOTS],
  }
  await writeFile(path, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
  return schema
}

export async function doctorStateSchema(env: LfgEnv = resolveLfgEnv()): Promise<StateDoctorResult> {
  const schema = await readJsonObject(stateSchemaPath(env))
  const missingDirectories: string[] = []
  for (const dir of STATE_BOOTSTRAP_DIRS) if (!(await isDirectory(join(env.data, dir)))) missingDirectories.push(dir)
  const roots = Array.isArray(schema.roots) ? schema.roots.filter((root): root is string => typeof root === "string") : []
  const missingRoots = STATE_SCHEMA_ROOTS.filter((root) => !roots.includes(root))
  const schemaVersion = typeof schema.version === "number" ? schema.version : null
  return { ok: schemaVersion === STATE_SCHEMA_VERSION && missingDirectories.length === 0 && missingRoots.length === 0, schemaPath: stateSchemaPath(env), schemaVersion, missingDirectories, missingRoots }
}

export function stateSchemaPath(env: LfgEnv): string {
  return join(env.stateDir, "schema.json")
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStateMigration(value: unknown): value is StateMigration {
  if (!isRecord(value)) return false
  return typeof value.id === "string" && typeof value.ts === "string" && typeof value.to === "number" && value.status === "applied"
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
