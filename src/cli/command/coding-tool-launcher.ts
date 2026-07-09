import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { resolveGrokSetupHome } from "../../grok/install/grok-home"
import { readLfgRuntimeConfigFile } from "../../grok/models/lfg-runtime-config"
import { isRecord, type JsonObject } from "../../shared/json"
import { buildPiAgentLfgAuthEnv } from "./pi-agent-auth-env"
import {
  codingToolAdapterExecutionPlanJson,
  codingToolAdapterSelectionJson,
  DEFAULT_CODING_TOOL_ADAPTER,
  type CodingToolAdapterId,
} from "../setup/coding-tool-adapter"

export type CodingToolLaunchPlan = JsonObject & {
  readonly ok: true
  readonly status: "planned"
  readonly command: "launch"
  readonly dryRun: true
  readonly executed: false
  readonly codingToolAdapter: JsonObject
}

export type CodingToolLaunchResult = JsonObject & {
  readonly ok: boolean
  readonly status: "launched" | "adapter_unavailable" | "adapter_failed"
  readonly command: "launch"
  readonly executed: true
  readonly codingToolAdapter: JsonObject
  readonly exitCode: number
  readonly error?: string
}

export async function codingToolLaunchPlan(cliAdapter: CodingToolAdapterId | null): Promise<CodingToolLaunchPlan> {
  const adapter = await resolveLaunchAdapter(cliAdapter)
  return {
    ok: true,
    status: "planned",
    command: "launch",
    dryRun: true,
    executed: false,
    codingToolAdapter: codingToolAdapterSelectionJson(adapter),
  }
}

export async function launchCodingToolAdapter(cliAdapter: CodingToolAdapterId | null): Promise<CodingToolLaunchResult> {
  const adapter = await resolveLaunchAdapter(cliAdapter)
  const selection = codingToolAdapterSelectionJson(adapter)
  const plan = codingToolAdapterExecutionPlanJson(adapter)
  const missingRequiredFile = await firstMissingRequiredFile(plan.requiredFiles)
  if (missingRequiredFile !== null) {
    return {
      ok: false,
      status: "adapter_unavailable",
      command: "launch",
      executed: true,
      codingToolAdapter: selection,
      exitCode: 78,
      error: `Cannot launch ${adapter}: required setup file is missing: ${missingRequiredFile}. Run "lfg setup --run" before launching the selected adapter.`,
    }
  }
  const [command, ...args] = plan.argv
  const envResult = adapter === "pi-agent"
    ? await buildPiAgentLfgAuthEnv(process.env, resolveGrokSetupHome(process.env))
    : { ok: true as const, env: process.env }
  if (!envResult.ok) {
    return {
      ok: false,
      status: "adapter_unavailable",
      command: "launch",
      executed: true,
      codingToolAdapter: selection,
      exitCode: 78,
      error: envResult.error,
    }
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: envResult.env,
      stdio: "inherit",
    })

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        resolve({
          ok: false,
          status: "adapter_unavailable",
          command: "launch",
          executed: true,
          codingToolAdapter: selection,
          exitCode: 127,
          error: `Cannot launch ${adapter}: command "${command}" was not found on PATH. Run "lfg setup" to configure another adapter, or install ${command}.`,
        })
        return
      }
      resolve({
        ok: false,
        status: "adapter_failed",
        command: "launch",
        executed: true,
        codingToolAdapter: selection,
        exitCode: 1,
        error: `Cannot launch ${adapter}: ${error.message}`,
      })
    })

    child.on("close", (code) => {
      const exitCode = code ?? 1
      resolve({
        ok: exitCode === 0,
        status: exitCode === 0 ? "launched" : "adapter_failed",
        command: "launch",
        executed: true,
        codingToolAdapter: selection,
        exitCode,
        ...(exitCode === 0 ? {} : { error: `${adapter} exited with code ${exitCode}.` }),
      })
    })
  })
}

async function resolveLaunchAdapter(cliAdapter: CodingToolAdapterId | null): Promise<CodingToolAdapterId> {
  if (cliAdapter !== null) {
    return cliAdapter
  }
  const home = resolveGrokSetupHome(process.env)
  const config = await readLfgRuntimeConfigFile(home)
  return config?.coding_tool_adapter ?? DEFAULT_CODING_TOOL_ADAPTER
}

async function firstMissingRequiredFile(requiredFiles: readonly string[]): Promise<string | null> {
  for (const file of requiredFiles) {
    const path = expandRequiredFilePath(file)
    if (!(await pathExists(path))) {
      return path
    }
  }
  return null
}

function expandRequiredFilePath(file: string): string {
  if (file === "~/.grok") {
    return join(resolveGrokSetupHome(process.env), ".grok")
  }
  if (file.startsWith("~/.grok/")) {
    return join(resolveGrokSetupHome(process.env), ".grok", file.slice("~/.grok/".length))
  }
  return file
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function formatLaunchError(result: CodingToolLaunchResult): string {
  const selection = result.codingToolAdapter
  const selected = isRecord(selection) && typeof selection.selected === "string" ? selection.selected : "adapter"
  return result.error ?? `Cannot launch ${selected}.`
}
