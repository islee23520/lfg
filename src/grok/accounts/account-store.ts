import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { z } from "zod"

const authSchema = z.record(z.string(), z.unknown())
const accountNameSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/)

type AccountRow = {
  readonly id: number
  readonly name: string
  readonly email: string | null
  readonly enabled: number
  readonly created_at: string
  readonly turns_used: number
  readonly last_selected_at: string | null
}

type StoredAccountRow = AccountRow & {
  readonly auth_json: string
}

export type AccountSummary = {
  readonly name: string
  readonly email: string | null
  readonly enabled: boolean
  readonly active: boolean
  readonly createdAt: string
  readonly turnsUsed: number
  readonly lastSelectedAt: string | null
}

export type RotationResult =
  | { readonly ok: true; readonly status: "account_selected"; readonly account: AccountSummary }
  | { readonly ok: true; readonly status: "host_auth_preserved"; readonly account: AccountSummary | null }
  | { readonly ok: false; readonly status: "no_enabled_accounts" | "auth_expired_login_required"; readonly account: null }

export class AccountStoreError extends Error {
  constructor(
    readonly code: "invalid_account_name" | "invalid_auth_json" | "account_not_found" | "account_disabled",
    message: string,
  ) {
    super(message)
    this.name = "AccountStoreError"
  }
}

export class AccountStore {
  readonly #db: DatabaseSync
  readonly #dbPath: string

  constructor(dbPath: string) {
    this.#dbPath = dbPath
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
    this.#db = new DatabaseSync(dbPath)
    chmodSync(dbPath, 0o600)
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        email TEXT,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        auth_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS rotation_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        active_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        cursor_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
      );
      INSERT OR IGNORE INTO rotation_state(singleton) VALUES (1);
    `)
    this.#migrateAccountsSchema()
  }

  importAuth(nameInput: string, authPath: string): AccountSummary {
    const name = parseAccountName(nameInput)
    const auth = parseAuth(readFileSync(authPath, "utf8"))
    const email = extractEmail(auth)
    this.#db.prepare(`
      INSERT INTO accounts(name, email, enabled, auth_json)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(name) DO UPDATE SET email = excluded.email, auth_json = excluded.auth_json
    `).run(name, email, JSON.stringify(auth))
    return this.#summary(this.#accountByName(name))
  }

  list(): readonly AccountSummary[] {
    const activeId = this.#activeId()
    return this.#db.prepare("SELECT id, name, email, enabled, created_at, turns_used, last_selected_at FROM accounts ORDER BY id").all()
      .map((row) => toAccountRow(row))
      .map((row) => summaryFromRow(row, activeId))
  }

  status(): {
    readonly enabled: boolean
    readonly totalAccounts: number
    readonly enabledAccounts: number
    readonly activeAccount: AccountSummary | null
    readonly databasePath: string
  } {
    const accounts = this.list()
    const activeAccount = accounts.find((account) => account.active) ?? null
    return {
      enabled: this.#settingEnabled(),
      totalAccounts: accounts.length,
      enabledAccounts: accounts.filter((account) => account.enabled).length,
      activeAccount,
      databasePath: this.#dbPath,
    }
  }

  remove(nameInput: string): { readonly removed: boolean; readonly name: string } {
    const name = parseAccountName(nameInput)
    const result = this.#db.prepare("DELETE FROM accounts WHERE name = ?").run(name)
    return { removed: result.changes > 0, name }
  }

  setEnabled(nameInput: string, enabled: boolean): AccountSummary {
    const name = parseAccountName(nameInput)
    const result = this.#db.prepare("UPDATE accounts SET enabled = ? WHERE name = ?").run(enabled ? 1 : 0, name)
    if (result.changes === 0) throw new AccountStoreError("account_not_found", `Account not found: ${name}`)
    if (!enabled) {
      this.#db.prepare("UPDATE rotation_state SET active_account_id = NULL WHERE singleton = 1 AND active_account_id = (SELECT id FROM accounts WHERE name = ?)").run(name)
    }
    return this.#summary(this.#accountByName(name))
  }

  setRotationEnabled(enabled: boolean): boolean {
    this.#db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    this.#db.prepare("INSERT INTO settings(key, value) VALUES ('rotation_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(enabled ? "1" : "0")
    return enabled
  }

  use(nameInput: string, activeAuthPath = join(dirname(this.#dbPath), "auth.json")): RotationResult {
    const name = parseAccountName(nameInput)
    const account = this.#accountByName(name)
    if (account.enabled !== 1) throw new AccountStoreError("account_disabled", `Account is disabled: ${name}`)
    this.#activate(account, activeAuthPath)
    return { ok: true, status: "account_selected", account: this.#summary(this.#accountByName(name)) }
  }

  rotate(activeAuthPath?: string): RotationResult {
    if (!this.#settingEnabled()) return { ok: false, status: "no_enabled_accounts", account: null }
    if (!this.#hasEnabledAccounts()) return { ok: false, status: "no_enabled_accounts", account: null }
    const hostAuth = activeAuthPath === undefined ? null : readAuthIfExists(activeAuthPath)
    if (hostAuth !== null) this.#refreshStoredSnapshotFromHost(hostAuth)
    const candidate = this.#nextEnabledAccount()
    if (candidate === null) {
      return hostAuth !== null && authUsability(hostAuth) === "valid"
        ? { ok: true, status: "host_auth_preserved", account: this.list().find((account) => account.active) ?? null }
        : { ok: false, status: "auth_expired_login_required", account: null }
    }
    if (hostAuth !== null && authUsability(hostAuth) === "valid" && authUsability(parseAuth(candidate.auth_json)) === "refreshable") {
      return { ok: true, status: "host_auth_preserved", account: this.list().find((account) => account.active) ?? null }
    }
    this.#activate(candidate, activeAuthPath)
    return { ok: true, status: "account_selected", account: this.#summary(this.#accountByName(candidate.name)) }
  }

  close(): void {
    this.#db.close()
  }

  #activate(account: StoredAccountRow, activeAuthPath?: string): void {
    if (activeAuthPath !== undefined) writeAuthAtomically(activeAuthPath, account.auth_json)
    this.#db.prepare("UPDATE accounts SET turns_used = turns_used + 1, last_selected_at = datetime('now') WHERE id = ?").run(account.id)
    this.#db.prepare("UPDATE rotation_state SET active_account_id = ?, cursor_account_id = ? WHERE singleton = 1").run(account.id, account.id)
  }

  #accountByName(name: string): StoredAccountRow {
    const row = this.#db.prepare("SELECT id, name, email, enabled, auth_json, created_at, turns_used, last_selected_at FROM accounts WHERE name = ?").get(name)
    if (row === undefined) throw new AccountStoreError("account_not_found", `Account not found: ${name}`)
    return toStoredAccountRow(row)
  }

  #nextEnabledAccount(): StoredAccountRow | null {
    const rows = this.#db.prepare(`
      SELECT id, name, email, enabled, auth_json, created_at, turns_used, last_selected_at
      FROM accounts
      WHERE enabled = 1
    `).all().map((row) => toStoredAccountRow(row))
      .filter((row) => authUsability(parseAuth(row.auth_json)) !== "expired")
      .sort((left, right) => {
        const usability = authRank(parseAuth(left.auth_json)) - authRank(parseAuth(right.auth_json))
        if (usability !== 0) return usability
        if (left.turns_used !== right.turns_used) return left.turns_used - right.turns_used
        if (left.last_selected_at === null && right.last_selected_at !== null) return -1
        if (left.last_selected_at !== null && right.last_selected_at === null) return 1
        return (left.last_selected_at ?? "").localeCompare(right.last_selected_at ?? "") || left.id - right.id
      })
    const first = rows[0]
    if (first === undefined) return null
    const second = rows[1]
    const activeId = this.#activeId()
    return first.id === activeId && second?.turns_used === first.turns_used ? second : first
  }

  #refreshStoredSnapshotFromHost(auth: Readonly<Record<string, unknown>>): void {
    if (authUsability(auth) !== "valid") return
    const email = extractEmail(auth)
    if (email === null) return
    this.#db.prepare("UPDATE accounts SET auth_json = ? WHERE email = ?").run(JSON.stringify(auth), email)
  }

  #migrateAccountsSchema(): void {
    const columns = new Set(this.#db.prepare("PRAGMA table_info(accounts)").all().map((row) => String(row.name)))
    if (!columns.has("turns_used")) this.#db.exec("ALTER TABLE accounts ADD COLUMN turns_used INTEGER NOT NULL DEFAULT 0")
    if (!columns.has("last_selected_at")) this.#db.exec("ALTER TABLE accounts ADD COLUMN last_selected_at TEXT")
  }

  #activeId(): number | null {
    return nullableId(this.#db.prepare("SELECT active_account_id AS id FROM rotation_state WHERE singleton = 1").get())
  }

  #settingEnabled(): boolean {
    this.#db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    const row = this.#db.prepare("SELECT value FROM settings WHERE key = 'rotation_enabled'").get()
    return row === undefined || row.value !== "0"
  }

  #hasEnabledAccounts(): boolean {
    return Number(this.#db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE enabled = 1").get()?.count ?? 0) > 0
  }

  #summary(row: AccountRow): AccountSummary {
    return summaryFromRow(row, this.#activeId())
  }
}

function parseAccountName(input: string): string {
  const parsed = accountNameSchema.safeParse(input)
  if (!parsed.success) throw new AccountStoreError("invalid_account_name", "Account name must use letters, numbers, dot, underscore, or dash")
  return parsed.data
}

function parseAuth(text: string): Record<string, unknown> {
  try {
    const parsed = authSchema.safeParse(JSON.parse(text))
    if (parsed.success) return parsed.data
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  throw new AccountStoreError("invalid_auth_json", "Auth file must contain a JSON object")
}

function extractEmail(auth: Readonly<Record<string, unknown>>): string | null {
  for (const key of ["email", "user_email", "account_email"] as const) {
    const value = auth[key]
    if (typeof value === "string" && value.trim().length > 0) return value.trim()
  }
  for (const parentKey of ["auth", "user", "account"] as const) {
    const parent = auth[parentKey]
    const parsed = authSchema.safeParse(parent)
    if (parsed.success) {
      const email = extractEmail(parsed.data)
      if (email !== null) return email
    }
  }
  return null
}

function writeAuthAtomically(path: string, authJson: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak`)
    chmodSync(`${path}.bak`, 0o600)
  }
  const temporary = `${path}.lfg-${process.pid}.tmp`
  writeFileSync(temporary, `${authJson}\n`, { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, path)
  chmodSync(path, 0o600)
}

function readAuthIfExists(path: string): Record<string, unknown> | null {
  try {
    return parseAuth(readFileSync(path, "utf8"))
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null
    return null
  }
}

function authRank(auth: Readonly<Record<string, unknown>>): number {
  return authUsability(auth) === "valid" ? 0 : 1
}

function authUsability(auth: Readonly<Record<string, unknown>>): "valid" | "refreshable" | "expired" {
  const oidc = findOidcCredential(auth)
  if (oidc === null || oidc.expiresAt === null) return "valid"
  if (oidc.expiresAt > Date.now()) return "valid"
  return oidc.hasRefreshToken ? "refreshable" : "expired"
}

function findOidcCredential(value: unknown): { readonly expiresAt: number | null; readonly hasRefreshToken: boolean } | null {
  const parsed = authSchema.safeParse(value)
  if (!parsed.success) return null
  const record = parsed.data
  const mode = record.auth_mode
  const expiresValue = record.expires_at ?? record.expires
  if (mode === "oidc" || expiresValue !== undefined) {
    const expiresAt = typeof expiresValue === "number"
      ? expiresValue
      : typeof expiresValue === "string"
        ? Date.parse(expiresValue)
        : Number.NaN
    return {
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      hasRefreshToken: typeof record.refresh_token === "string" && record.refresh_token.trim().length > 0,
    }
  }
  for (const child of Object.values(record)) {
    const found = findOidcCredential(child)
    if (found !== null) return found
  }
  return null
}

function summaryFromRow(row: AccountRow, activeId: number | null): AccountSummary {
  return { name: row.name, email: row.email, enabled: row.enabled === 1, active: row.id === activeId, createdAt: row.created_at, turnsUsed: row.turns_used, lastSelectedAt: row.last_selected_at }
}

function toAccountRow(row: Readonly<Record<string, unknown>>): AccountRow {
  return { id: Number(row.id), name: String(row.name), email: typeof row.email === "string" ? row.email : null, enabled: Number(row.enabled), created_at: String(row.created_at), turns_used: Number(row.turns_used), last_selected_at: typeof row.last_selected_at === "string" ? row.last_selected_at : null }
}

function toStoredAccountRow(row: Readonly<Record<string, unknown>>): StoredAccountRow {
  return { ...toAccountRow(row), auth_json: String(row.auth_json) }
}

function nullableId(row: Readonly<Record<string, unknown>> | undefined): number | null {
  return row === undefined || row.id === null ? null : Number(row.id)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
