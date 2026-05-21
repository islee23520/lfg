import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { bootstrapState } from "../src/runtime-ts/foundation/state-schema"
import { resolveLfgEnv, type LfgEnv } from "../src/runtime-ts/foundation/env"

export type TempLfgState = { root: string; data: string; env: LfgEnv; processEnv: NodeJS.ProcessEnv; cleanup(): Promise<void> }

export async function createTempLfgState(options: { pluginRoot?: string; prefix?: string } = {}): Promise<TempLfgState> {
  const data = await mkdtemp(join(tmpdir(), options.prefix ?? "lfg-ts-"))
  const root = options.pluginRoot ?? resolveLfgEnv({ cwd: join(import.meta.dir, "..", "..", "..") }).root
  const processEnv: NodeJS.ProcessEnv = { ...process.env, GROK_PLUGIN_ROOT: root, GROK_PLUGIN_DATA: data, LFG_LAUNCHER: "lfg" }
  const env = resolveLfgEnv({ env: processEnv, cwd: join(root, "..", "..") })
  await bootstrapState(env)
  return { root, data, env, processEnv, cleanup: () => rm(data, { recursive: true, force: true }) }
}
