import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, test } from "vitest"

import { AccountStore } from "./account-store"

const tempRoots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lfg-accounts-"))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises")
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("AccountStore", () => {
  test("imports auth securely and exposes only redacted account metadata", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const authPath = join(grok, "auth.json")
    const dbPath = join(grok, "lfg-accounts.sqlite")
    await mkdir(grok, { recursive: true })
    await writeFile(authPath, JSON.stringify({ email: "one@example.com", access_token: "secret-access", refresh_token: "secret-refresh" }))

    // When
    const store = new AccountStore(dbPath)
    const imported = store.importAuth("one", authPath)
    const listed = store.list()
    store.close()

    // Then
    expect(imported).toMatchObject({ name: "one", email: "one@example.com", enabled: true })
    expect(JSON.stringify(listed)).not.toContain("secret-access")
    expect(JSON.stringify(listed)).not.toContain("secret-refresh")
    expect((await stat(dbPath)).mode & 0o777).toBe(0o600)
  })

  test("extracts email from nested Grok host auth metadata", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const authPath = join(grok, "auth.json")
    await mkdir(grok, { recursive: true })
    await writeFile(authPath, JSON.stringify({ auth: { user: { email: "nested@example.com" }, access_token: "secret" } }))

    // When
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    const imported = store.importAuth("nested", authPath)
    store.close()

    // Then
    expect(imported.email).toBe("nested@example.com")
  })

  test("selects the least-used enabled account and persists usage counters", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const dbPath = join(grok, "lfg-accounts.sqlite")
    await mkdir(grok, { recursive: true })
    const authOne = join(root, "one.json")
    const authTwo = join(root, "two.json")
    await writeFile(authOne, JSON.stringify({ email: "one@example.com", token: "one-secret" }))
    await writeFile(authTwo, JSON.stringify({ email: "two@example.com", token: "two-secret" }))
    const store = new AccountStore(dbPath)
    store.importAuth("one", authOne)
    store.importAuth("two", authTwo)

    // When
    const first = store.rotate()
    const second = store.rotate()
    store.close()
    const reopened = new AccountStore(dbPath)
    const third = reopened.rotate()
    const accounts = reopened.list()
    reopened.close()

    // Then
    expect([first.account?.name, second.account?.name, third.account?.name]).toEqual(["one", "two", "one"])
    expect(accounts).toMatchObject([
      { name: "one", turnsUsed: 2, lastSelectedAt: expect.any(String) },
      { name: "two", turnsUsed: 1, lastSelectedAt: expect.any(String) },
    ])
  })

  test("rotate selects an account with fewer explicit uses", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const authOne = join(root, "one.json")
    const authTwo = join(root, "two.json")
    await mkdir(grok, { recursive: true })
    await writeFile(authOne, "{}")
    await writeFile(authTwo, "{}")
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("one", authOne)
    store.importAuth("two", authTwo)
    store.use("one")
    store.use("one")
    store.use("one")

    // When
    const selected = store.rotate()
    store.close()

    // Then
    expect(selected.account?.name).toBe("two")
  })

  test("rotate alternates accounts that start with equal usage", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const authOne = join(root, "one.json")
    const authTwo = join(root, "two.json")
    await mkdir(grok, { recursive: true })
    await writeFile(authOne, "{}")
    await writeFile(authTwo, "{}")
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("one", authOne)
    store.importAuth("two", authTwo)

    // When
    const first = store.rotate()
    const second = store.rotate()
    store.close()

    // Then
    expect([first.account?.name, second.account?.name]).toEqual(["one", "two"])
  })

  test("increments usage for explicit use and exposes counters without tokens", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const source = join(root, "one.json")
    await mkdir(grok, { recursive: true })
    await writeFile(source, JSON.stringify({ email: "one@example.com", access_token: "secret" }))
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("one", source)

    // When
    store.use("one", join(grok, "auth.json"))
    const listed = store.list()
    const status = store.status()
    store.close()

    // Then
    expect(listed[0]).toMatchObject({ turnsUsed: 1, lastSelectedAt: expect.any(String) })
    expect(status.activeAccount).toMatchObject({ turnsUsed: 1, lastSelectedAt: expect.any(String) })
    expect(JSON.stringify({ listed, status })).not.toContain("secret")
  })

  test("migrates legacy databases and avoids reselecting an active tied account", async () => {
    // Given
    const root = await tempRoot()
    const dbPath = join(root, ".grok", "lfg-accounts.sqlite")
    await mkdir(join(root, ".grok"), { recursive: true })
    const legacy = new DatabaseSync(dbPath)
    legacy.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, email TEXT, enabled INTEGER NOT NULL DEFAULT 1, auth_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE rotation_state (singleton INTEGER PRIMARY KEY, active_account_id INTEGER, cursor_account_id INTEGER);
      INSERT INTO accounts(name, auth_json) VALUES ('one', '{}'), ('two', '{}');
      INSERT INTO rotation_state(singleton, active_account_id, cursor_account_id) VALUES (1, 1, 1);
    `)
    legacy.close()

    // When
    const store = new AccountStore(dbPath)
    const selected = store.rotate()
    const accounts = store.list()
    store.close()

    // Then
    expect(selected.account?.name).toBe("two")
    expect(accounts).toMatchObject([
      { name: "one", turnsUsed: 0, lastSelectedAt: null },
      { name: "two", turnsUsed: 1, lastSelectedAt: expect.any(String) },
    ])
  })

  test("skips disabled accounts and reports empty pools without mutating auth", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const dbPath = join(grok, "lfg-accounts.sqlite")
    const activeAuthPath = join(grok, "auth.json")
    const source = join(root, "one.json")
    await mkdir(grok, { recursive: true })
    await writeFile(activeAuthPath, JSON.stringify({ marker: "original" }))
    await chmod(activeAuthPath, 0o600)
    await writeFile(source, JSON.stringify({ email: "one@example.com", token: "one-secret" }))
    const store = new AccountStore(dbPath)
    store.importAuth("one", source)
    store.setEnabled("one", false)

    // When
    const rotated = store.rotate(activeAuthPath)
    store.close()

    // Then
    expect(rotated).toMatchObject({ ok: false, status: "no_enabled_accounts" })
    expect(JSON.parse(await readFile(activeAuthPath, "utf8"))).toEqual({ marker: "original" })
  })

  test("use backs up host auth before atomically selecting an account", async () => {
    // Given
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const dbPath = join(grok, "lfg-accounts.sqlite")
    const activeAuthPath = join(grok, "auth.json")
    const source = join(root, "one.json")
    await mkdir(grok, { recursive: true })
    await writeFile(activeAuthPath, JSON.stringify({ marker: "host-auth" }))
    await writeFile(source, JSON.stringify({ email: "one@example.com", access_token: "one-secret" }))
    const store = new AccountStore(dbPath)
    store.importAuth("one", source)

    // When
    const used = store.use("one", activeAuthPath)
    const removed = store.remove("one")
    const status = store.status()
    store.close()

    // Then
    expect(used.account?.name).toBe("one")
    expect(JSON.parse(await readFile(`${activeAuthPath}.bak`, "utf8"))).toEqual({ marker: "host-auth" })
    expect(JSON.parse(await readFile(activeAuthPath, "utf8"))).toMatchObject({ email: "one@example.com", access_token: "one-secret" })
    expect(removed).toMatchObject({ removed: true })
    expect(status.activeAccount).toBeNull()
  })

  test("rotate never clobbers fresher host auth with an expired sqlite snapshot", async () => {
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const activeAuthPath = join(grok, "auth.json")
    const expired = join(root, "expired.json")
    await mkdir(grok, { recursive: true })
    await writeFile(activeAuthPath, oidcAuth("fresh", Date.now() + 3_600_000, "fresh-refresh"))
    await writeFile(expired, oidcAuth("stale", Date.now() - 3_600_000))
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("stale", expired)

    const result = store.rotate(activeAuthPath)
    store.close()

    expect(result).toMatchObject({ ok: true, status: "host_auth_preserved" })
    expect(await readFile(activeAuthPath, "utf8")).toContain("fresh-refresh")
    expect(await readFile(activeAuthPath, "utf8")).not.toContain("stale")
  })

  test("rotate prefers a non-expired account over a less-used expired account", async () => {
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const expired = join(root, "expired.json")
    const valid = join(root, "valid.json")
    await mkdir(grok, { recursive: true })
    await writeFile(expired, oidcAuth("expired", Date.now() - 60_000))
    await writeFile(valid, oidcAuth("valid", Date.now() + 3_600_000, "valid-refresh"))
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("expired", expired)
    store.importAuth("valid", valid)

    const result = store.rotate(join(grok, "auth.json"))
    store.close()

    expect(result).toMatchObject({ ok: true, status: "account_selected", account: { name: "valid" } })
  })

  test("rotate keeps an expired OIDC account eligible when it has a refresh_token", async () => {
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const refreshable = join(root, "refreshable.json")
    await mkdir(grok, { recursive: true })
    await writeFile(refreshable, oidcAuth("refreshable", Date.now() - 60_000, "keep-refresh-token"))
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("refreshable", refreshable)

    const result = store.rotate(join(grok, "auth.json"))
    store.close()

    expect(result).toMatchObject({ ok: true, status: "account_selected", account: { name: "refreshable" } })
    expect(await readFile(join(grok, "auth.json"), "utf8")).toContain("keep-refresh-token")
  })

  test("rotate reports auth_expired_login_required when every account is irrecoverably expired", async () => {
    const root = await tempRoot()
    const grok = join(root, ".grok")
    const activeAuthPath = join(grok, "auth.json")
    const expired = join(root, "expired.json")
    await mkdir(grok, { recursive: true })
    await writeFile(activeAuthPath, oidcAuth("host-expired", Date.now() - 60_000))
    await writeFile(expired, oidcAuth("expired", Date.now() - 60_000))
    const store = new AccountStore(join(grok, "lfg-accounts.sqlite"))
    store.importAuth("expired", expired)

    const result = store.rotate(activeAuthPath)
    store.close()

    expect(result).toMatchObject({ ok: false, status: "auth_expired_login_required", account: null })
    expect(await readFile(activeAuthPath, "utf8")).toContain("host-expired")
  })
})

function oidcAuth(access: string, expires: number, refreshToken?: string): string {
  return JSON.stringify({
    "https://auth.x.ai::grok-cli": {
      auth_mode: "oidc",
      oidc_issuer: "https://auth.x.ai",
      oidc_client_id: "grok-cli",
      key: access,
      ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
      expires_at: new Date(expires).toISOString(),
    },
  })
}
