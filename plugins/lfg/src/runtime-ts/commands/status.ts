import { join } from "node:path"
import { bootstrapState } from "../foundation/state-schema"
import { commandEnv, detectRepo, listJsonFiles, readCatalogSkillCount, readJson, readPluginVersion, type CommandContext, type JsonObject } from "./common"

export async function status(context: CommandContext = {}): Promise<JsonObject> {
  const env = commandEnv(context)
  await bootstrapState(env)
  const goals = await listGoals(env.stateDir)
  return { ok: true, version: await readPluginVersion(env), launcher: env.launcher, pluginRoot: env.root, pluginData: env.data, repo: await detectRepo(context.cwd), catalogSkills: await readCatalogSkillCount(env), goals: { total: goals.length, active: goals.filter((goal) => goal.status === "active").length }, currentGoal: await readJson(join(env.stateDir, "current-goal.json"), null), currentPlan: await readJson(join(env.stateDir, "current-plan.json"), null), typescriptRuntime: await typescriptRuntimeStatus(env) }
}

async function listGoals(stateDir: string): Promise<JsonObject[]> {
  const dir = join(stateDir, "goals")
  const files = await listJsonFiles(dir)
  const goals: JsonObject[] = []
  for (const file of files) {
    const parsed = await readJson(join(dir, file), null)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) goals.push(parsed as JsonObject)
  }
  return goals
}

async function typescriptRuntimeStatus(env: { root: string }): Promise<JsonObject> {
  const source = join(env.root, "src", "runtime-ts", "index.ts")
  const test = join(env.root, "src", "runtime-ts", "index.test.ts")
  const bunPath = Bun.which("bun")
  return { enabled: true, runtime: "typescript", source, test, testCommand: "bun test plugins/lfg/src/runtime-ts/index.test.ts", bunAvailable: Boolean(bunPath), bunPath, migration: "python-wrapper-to-typescript-runtime", omoStandaloneReference: "@oh-my-opencode/standalone-runtime" }
}
