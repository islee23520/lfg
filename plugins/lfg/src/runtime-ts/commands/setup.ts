import { join } from "node:path"
import { bootstrapState } from "../foundation/state-schema"
import { asRecord, commandEnv, copyTree, detectRepo, pathExists, readJson, readProviderState, setupPath, utcNow, writeJson, type CommandContext, type JsonObject } from "./common"

export type SetupOptions = { pluginDir?: string; dryRun?: boolean }
export type SetupInstallPlanOptions = { marketplace?: string }

export async function setup(options: SetupOptions = {}, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  await bootstrapState(env)
  const dest = options.pluginDir ?? process.env.LFG_PLUGIN_DEST ?? join(process.env.HOME ?? "", ".grok", "plugins", "lfg")
  const dryRun = Boolean(options.dryRun)
  const providerState = await readProviderState(env)
  if (!dryRun) await copyTree(env.root, dest)
  const record: JsonObject = { ok: true, dryRun, installed: !dryRun, plugin: { source: env.root, dest, exists: await pathExists(dest), manifest: join(dest, ".grok-plugin", "plugin.json") }, providers: { count: Object.keys(asRecord(providerState.providers)).length, path: join(env.stateDir, "providers.json") }, commands: { providerAdd: "lfg provider add", providerAddZai: "lfg provider add --id zai-main --kind zai --env ZAI_API_KEY", setupInteractive: "lfg setup", setupForceInteractive: "lfg setup --interactive", setupNoTui: "lfg setup --no-tui --openai yes --zai yes --copilot no --codex no", pluginInspect: "grok --cwd /tmp inspect --json" }, updatedAt: utcNow() }
  await writeJson(setupPath(env), record)
  record.path = setupPath(env)
  return record
}

export async function setupCheck(context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  await bootstrapState(env)
  const checks = { pluginRootExists: await pathExists(env.root), manifestExists: await pathExists(join(env.root, ".grok-plugin", "plugin.json")), skillsDirExists: await pathExists(join(env.root, "skills")), mcpExists: await pathExists(join(env.root, "bin", "lfg-mcp.ts")), hookExists: await pathExists(join(env.root, "hooks")), dataDirExists: await pathExists(env.data) }
  const record = { status: Object.values(checks).every(Boolean) ? "ok" : "needs-action", updatedAt: utcNow(), pluginRoot: env.root, pluginData: env.data, checks, repo: await detectRepo(context.cwd) }
  await writeJson(setupPath(env), record)
  return record
}

export async function setupInstallPlan(options: SetupInstallPlanOptions = {}, context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  await bootstrapState(env)
  const steps = ["add marketplace source in Grok /plugins", "install islee23520/lfg", "enable plugin skills, hooks, and MCP server", "run /setup check", "run runtime self-test and Grok inspect smoke"]
  const record = { status: "planned", updatedAt: utcNow(), marketplace: options.marketplace ?? "islee23520/lfg", steps: steps.map((text, index) => ({ id: index + 1, status: "pending", text })) }
  await writeJson(setupPath(env), record)
  return record
}

export async function setupShow(context: CommandContext = {}): Promise<unknown> {
  return readJson(setupPath(commandEnv(context)), { setup: [] })
}
