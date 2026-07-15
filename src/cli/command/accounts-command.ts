import { join } from "node:path"

import { AccountStore } from "../../grok/accounts/account-store"
import type { JsonObject } from "../../shared/json"

type AccountsCommandOptions = {
  readonly home: string
}

export function dispatchAccountsCommand(argv: readonly string[], options: AccountsCommandOptions): JsonObject {
  const grokHome = join(options.home, ".grok")
  const store = new AccountStore(join(grokHome, "lfg-accounts.sqlite"))
  try {
    const [subcommand, positionalName, authPath] = argv
    const name = valueAfter(argv, "--name") ?? positionalName
    if (subcommand === "add") {
      const flaggedName = valueAfter(argv, "--name")
      const accountName = flaggedName ?? positionalName
      const sourcePath = valueAfter(argv, "--from-auth") ?? (flaggedName === null ? authPath : undefined) ?? join(grokHome, "auth.json")
      if (accountName !== undefined && !accountName.startsWith("--")) {
        return { ok: true, status: "account_added", account: store.importAuth(accountName, sourcePath) }
      }
    }
    if (subcommand === "list") {
      const accounts = store.list()
      return {
        ok: true,
        status: "accounts_listed",
        accounts,
        totalAccounts: accounts.length,
        enabledAccounts: accounts.filter((account) => account.enabled).length,
        activeAccount: accounts.find((account) => account.active) ?? null,
      }
    }
    if (subcommand === "rotate") {
      return store.rotate(join(grokHome, "auth.json"))
    }
    if (subcommand === "use" && name !== undefined) {
      return store.use(name, join(grokHome, "auth.json"))
    }
    if (subcommand === "status") {
      return { ok: true, status: "accounts_status", ...store.status() }
    }
    if ((subcommand === "enable" || subcommand === "disable") && name !== undefined) {
      const enabled = subcommand === "enable"
      return { ok: true, status: enabled ? "account_enabled" : "account_disabled", account: store.setEnabled(name, enabled) }
    }
    if (subcommand === "remove" && name !== undefined) {
      return { ok: true, status: "account_removed", ...store.remove(name) }
    }
    return {
      ok: false,
      status: "invalid_accounts_command",
      usage: "lfg --json accounts add [<name> <auth-path> | --name <name> [--from-auth <path>]] | list | status | use|enable|disable|remove <name> | rotate",
    }
  } finally {
    store.close()
  }
}

function valueAfter(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag)
  const value = index < 0 ? undefined : argv[index + 1]
  return value === undefined ? null : value
}
