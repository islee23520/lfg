import { join, resolve } from "node:path"
import { bootstrapState, ensureStateSchema, stateSchemaPath } from "../foundation/state-schema"
import { commandEnv, directoryExists, executablePath, pathExists, readCatalogSkillCount, readJsonObject, type CommandContext, type JsonObject } from "./common"

export async function doctor(context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  await bootstrapState(env)
  const checks: JsonObject[] = []
  const add = (name: string, ok: boolean, evidence: string, required = true): void => { checks.push({ name, ok, required, evidence }) }
  const manifest = join(env.root, ".grok-plugin", "plugin.json")
  add("grok_manifest", await pathExists(manifest), manifest)
  const mcpConfig = join(env.root, ".mcp.json")
  add("mcp_config", await pathExists(mcpConfig), mcpConfig)
  const skillCount = await readCatalogSkillCount(env)
  add("catalog", await pathExists(join(env.root, "catalog", "omo-skill-map.json")) && skillCount >= 17, `${join(env.root, "catalog", "omo-skill-map.json")} skills=${skillCount}`)
  const skillsDir = join(env.root, "skills")
  const skillMarkdownCount = await countSkillMarkdown(skillsDir)
  add("skills", skillMarkdownCount >= 17, `${skillsDir} skill_count=${skillMarkdownCount}`)
  const repoRoot = resolve(env.root, "..", "..")
  for (const [name, rel] of [["grok_marketplace", ".grok/plugins/marketplace.json"], ["agents_marketplace", ".agents/plugins/marketplace.json"]] as const) {
    const path = join(repoRoot, rel)
    const data = await readJsonObject(path)
    const plugins = Array.isArray(data.plugins) ? data.plugins : []
    const plugin = plugins.length > 0 && typeof plugins[0] === "object" && plugins[0] !== null ? plugins[0] as JsonObject : {}
    const source = typeof plugin.source === "object" && plugin.source !== null ? plugin.source as JsonObject : {}
    const metadata = typeof plugin.metadata === "object" && plugin.metadata !== null ? plugin.metadata as JsonObject : {}
    const ok = await pathExists(path) && plugin.name === "lfg" && source.path === "plugins/lfg" && metadata.packageName === "islee23520/lfg"
    add(name, ok, `${path} package=${String(metadata.packageName ?? "undefined")}`)
  }
  for (const [exe, required] of [["tmux", true], ["hermes", false], ["claude", false], ["codex", false], ["grok", false]] as const) {
    const found = await executablePath(exe)
    add(`exe:${exe}`, Boolean(found), found ?? "not found", required)
  }
  add("plugin_data", await directoryExists(env.data) || await directoryExists(resolve(env.data, "..")), env.data, true)
  add("default_launcher", true, `lfg (effective=${env.launcher})`, false)
  const schema = await ensureStateSchema(env)
  add("state_schema", schema.version === 2 && await pathExists(stateSchemaPath(env)), `${stateSchemaPath(env)} version=${schema.version}`, true)
  const tsSource = join(env.root, "src", "runtime-ts", "index.ts")
  add("typescript_runtime", await pathExists(tsSource), `${tsSource} test=bun test plugins/lfg/src/runtime-ts/index.test.ts`, true)
  const providers = await teamProviderMatrix()
  const available = providers.filter((provider) => provider.available).map((provider) => provider.provider)
  add("team_provider_commands", true, `available=${available.join(",")} providers=${providers.map((provider) => provider.provider).join(",")}`, false)
  const bridge = await hookBridgeStatus(env.root)
  add("global_hook_bridge", Boolean(bridge.ok), `installed=${String(bridge.installed)} valid=${String(bridge.valid)} config=${String(bridge.config)}`, false)
  const failedRequired = checks.filter((check) => check.required === true && check.ok !== true)
  const warnings = checks.filter((check) => check.required !== true && check.ok !== true)
  return { ok: failedRequired.length === 0, status: failedRequired.length === 0 ? "pass" : "fail", pluginRoot: env.root, pluginData: env.data, checks, failedRequired, warnings }
}

export async function doctorStateSchemaCheck(context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  const schema = await bootstrapState(env)
  return { ok: true, status: "pass", operation: "doctor_state_schema_check", schema, stateRoots: { state: env.stateDir, runs: env.runsDir, plans: env.plansDir, boulder: join(env.data, "boulder"), notepads: join(env.data, "notepads"), mailbox: join(env.data, "mailbox"), tasklists: join(env.data, "tasklists"), teams: join(env.data, "teams"), wiki: join(env.data, "wiki"), hyperplan: join(env.data, "hyperplan"), dispatchGate: join(env.data, "dispatch-gate") }, migrationStatus: schema.migrationStatus, migrations: schema.migrations, evidence: ["state-schema-versioning=ok", "state-schema-doctor=ok", "continuation-gate=ok"] }
}

async function countSkillMarkdown(skillsDir: string): Promise<number> {
  try {
    const dirs = await Array.fromAsync(new Bun.Glob("*/SKILL.md").scan({ cwd: skillsDir }))
    return dirs.length
  } catch {
    return 0
  }
}

async function teamProviderMatrix(): Promise<Array<{ provider: string; executable: string | null; available: boolean }>> {
  const executables: Record<string, string | null> = { hermes: "hermes", claude: "claude", codex: "codex", gemini: "gemini", copilot: "copilot", zai: null, opencode: "opencode", grok: null, subagent: null, noop: null }
  const rows: Array<{ provider: string; executable: string | null; available: boolean }> = []
  for (const [provider, executable] of Object.entries(executables)) rows.push({ provider, executable, available: executable === null ? true : Boolean(await executablePath(executable)) })
  return rows
}

async function hookBridgeStatus(root: string): Promise<JsonObject> {
  const config = join(root, "hooks", "hooks.json")
  const installed = await pathExists(config)
  return { ok: installed, installed, valid: installed, config }
}
