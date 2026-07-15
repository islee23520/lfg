import * as p from "@clack/prompts"
import pc from "picocolors"

import { dispatchAccountsCommand } from "./accounts-command"
import type { JsonObject } from "../../shared/json"

type AccountsTuiOptions = {
  readonly home: string
}

type AccountsTuiCheck = {
  readonly check?: boolean
  readonly input?: NodeJS.ReadStream
  readonly output?: NodeJS.WriteStream
}

const ACTIONS = ["list", "add", "remove", "use", "rotate", "status", "enable", "disable"] as const
type AccountAction = (typeof ACTIONS)[number]

export function shouldUseAccountsTui(options: AccountsTuiCheck = {}): boolean {
  if (options.check === false) return true
  return (options.input ?? process.stdin).isTTY === true && (options.output ?? process.stdout).isTTY === true
}

export async function runAccountsTui(options: AccountsTuiOptions): Promise<JsonObject> {
  p.intro(pc.bgCyan(pc.black(" lfg accounts ")))
  const action = await p.select<AccountAction>({
    message: "Choose an account action",
    options: ACTIONS.map((value) => ({ value, label: value })),
  })
  if (p.isCancel(action)) return cancelled()

  const argv: string[] = [action]
  if (["add", "remove", "use", "enable", "disable"].includes(action)) {
    const name = await p.text({ message: "Account name", validate: (value) => value?.trim().length === 0 ? "Name is required" : undefined })
    if (p.isCancel(name)) return cancelled()
    argv.push("--name", name)
  }
  if (action === "add") {
    const source = await p.text({ message: "Auth file", placeholder: "~/.grok/auth.json (default)" })
    if (p.isCancel(source)) return cancelled()
    if (source.trim().length > 0) argv.push("--from-auth", source.trim())
  }
  const result = dispatchAccountsCommand(argv, options)
  p.note(formatResult(result), "Account result")
  p.outro(result.ok === false ? pc.red("Account action failed") : pc.green("Account action completed"))
  return result
}

function cancelled(): JsonObject {
  p.cancel("Account action cancelled")
  return { ok: false, status: "accounts_cancelled" }
}

function formatResult(result: JsonObject): string {
  const status = typeof result.status === "string" ? result.status : "accounts_result"
  const account = result.account
  if (typeof account === "object" && account !== null && "name" in account && typeof account.name === "string") {
    return `${status}: ${account.name}`
  }
  return status
}
