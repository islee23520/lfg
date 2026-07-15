import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { afterEach, describe, expect, test } from "vitest"

import { dispatchAccountsCommand } from "./accounts-command"

const tempRoots: string[] = []

async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "lfg-accounts-cli-"))
  tempRoots.push(home)
  await mkdir(join(home, ".grok"), { recursive: true })
  return home
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("accounts command", () => {
  test("accepts --name for named account actions used by the TUI", async () => {
    const home = await tempHome()
    const authPath = join(home, ".grok", "source-auth.json")
    await writeFile(authPath, JSON.stringify({ email: "a@example.com", token: "secret-a" }))
    dispatchAccountsCommand(["add", "--name", "A", "--from-auth", authPath], { home })

    const disabled = dispatchAccountsCommand(["disable", "--name", "A"], { home })

    expect(disabled).toMatchObject({ ok: true, status: "account_disabled", account: { name: "A", enabled: false } })
  })
  test("adds and lists only redacted account metadata", async () => {
    // Given
    const home = await tempHome()
    const authPath = join(home, ".grok", "source-auth.json")
    await writeFile(authPath, JSON.stringify({ email: "a@example.com", access_token: "secret-token" }))

    // When
    const added = dispatchAccountsCommand(["add", "A", authPath], { home })
    const listed = dispatchAccountsCommand(["list"], { home })

    // Then
    expect(added).toMatchObject({ ok: true, status: "account_added", account: { name: "A", email: "a@example.com" } })
    expect(listed).toMatchObject({ ok: true, status: "accounts_listed", totalAccounts: 1, enabledAccounts: 1 })
    expect(JSON.stringify([added, listed])).not.toContain("secret-token")
  })

  test("rotates to the next enabled account", async () => {
    // Given
    const home = await tempHome()
    const grok = join(home, ".grok")
    const firstAuth = join(grok, "first.json")
    const secondAuth = join(grok, "second.json")
    await writeFile(firstAuth, JSON.stringify({ email: "a@example.com", token: "first-secret" }))
    await writeFile(secondAuth, JSON.stringify({ email: "b@example.com", token: "second-secret" }))
    dispatchAccountsCommand(["add", "A", firstAuth], { home })
    dispatchAccountsCommand(["add", "B", secondAuth], { home })

    // When
    const first = dispatchAccountsCommand(["rotate"], { home })
    const second = dispatchAccountsCommand(["rotate"], { home })

    // Then
    expect(first).toMatchObject({ ok: true, account: { name: "A", active: true } })
    expect(second).toMatchObject({ ok: true, account: { name: "B", active: true } })
  })

  test("selects a named account as active", async () => {
    // Given
    const home = await tempHome()
    const authPath = join(home, ".grok", "source-auth.json")
    await writeFile(authPath, JSON.stringify({ email: "a@example.com", token: "secret-token" }))
    dispatchAccountsCommand(["add", "A", authPath], { home })

    // When
    const selected = dispatchAccountsCommand(["use", "A"], { home })

    // Then
    expect(selected).toMatchObject({ ok: true, status: "account_selected", account: { name: "A", active: true } })
  })

  test("supports status, use, disable, enable, and remove actions", async () => {
    // Given
    const home = await tempHome()
    const authPath = join(home, ".grok", "source-auth.json")
    await writeFile(authPath, JSON.stringify({ user: { email: "a@example.com" }, token: "secret-token" }))
    dispatchAccountsCommand(["add", "--name", "A", "--from-auth", authPath], { home })

    // When
    const used = dispatchAccountsCommand(["use", "A"], { home })
    const disabled = dispatchAccountsCommand(["disable", "A"], { home })
    const enabled = dispatchAccountsCommand(["enable", "A"], { home })
    const status = dispatchAccountsCommand(["status"], { home })
    const removed = dispatchAccountsCommand(["remove", "A"], { home })

    // Then
    expect(used).toMatchObject({ ok: true, account: { name: "A", active: true } })
    expect(disabled).toMatchObject({ ok: true, status: "account_disabled", account: { enabled: false } })
    expect(enabled).toMatchObject({ ok: true, status: "account_enabled", account: { enabled: true } })
    expect(status).toMatchObject({ ok: true, status: "accounts_status", totalAccounts: 1 })
    expect(removed).toEqual({ ok: true, status: "account_removed", removed: true, name: "A" })
    expect(JSON.stringify([used, disabled, enabled, status, removed])).not.toContain("secret-token")
  })

  test("defaults add import to the Grok host auth file", async () => {
    // Given
    const home = await tempHome()
    await writeFile(join(home, ".grok", "auth.json"), JSON.stringify({ account: { email: "host@example.com" }, token: "host-secret" }))

    // When
    const added = dispatchAccountsCommand(["add", "--name", "host"], { home })

    // Then
    expect(added).toMatchObject({ ok: true, status: "account_added", account: { name: "host", email: "host@example.com" } })
    expect(JSON.stringify(added)).not.toContain("host-secret")
  })
})
