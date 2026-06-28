import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { delimiter, isAbsolute, join } from "node:path"
import {
  codingToolAdapterContractJson,
  codingToolAdapterSelectionJson,
  type CodingToolAdapterId,
  type CodingToolAdapterContractJson,
} from "../../shared/coding-tool-adapter"
import type { JsonObject } from "../../shared/json"
import { lfgRuntimeConfigPath } from "../models/lfg-runtime-config"

type AdapterAvailabilityStatus = "available" | "missing_command" | "missing_required_files"

type AdapterDiagnosticCode = "adapter_available" | "adapter_command_missing" | "adapter_config_missing"

type HostAuthDiagnostic = {
  readonly ownedBy: "grok"
  readonly checked: false
  readonly note: string
}

type AdapterAvailabilityDiagnostic = {
  readonly code: AdapterDiagnosticCode
  readonly message: string
  readonly action: string
  readonly hostAuth: HostAuthDiagnostic
}

export async function codingToolAdapterVerifyJson(
  home: string,
  selectedAdapter: CodingToolAdapterId,
  pluginPresent: boolean,
): Promise<JsonObject> {
  return {
    ...codingToolAdapterSelectionJson(selectedAdapter),
    configPath: lfgRuntimeConfigPath(home),
    availability: await codingToolAdapterAvailabilityJson(home, selectedAdapter, pluginPresent),
  }
}

async function codingToolAdapterAvailabilityJson(
  home: string,
  selectedAdapter: CodingToolAdapterId,
  pluginPresent: boolean,
): Promise<JsonObject> {
  const contract = codingToolAdapterContractJson(selectedAdapter)
  const commandPath = await findExecutableInPath(contract.command)
  const requiredFiles = await requiredFilesStatus(home, pluginPresent)
  const missingRequiredFiles = requiredFiles.filter((file) => file.exists === false).map((file) => file.path)
  const commandAvailable = commandPath !== null
  const status: AdapterAvailabilityStatus = !pluginPresent || missingRequiredFiles.length > 0
    ? "missing_required_files"
    : commandAvailable
      ? "available"
      : "missing_command"
  return {
    selected: selectedAdapter,
    command: contract.command,
    args: contract.args,
    commandPath,
    status,
    commandAvailable,
    requiredFiles,
    missingRequiredFiles,
    diagnostic: adapterAvailabilityDiagnostic(contract, status, missingRequiredFiles),
    fallbackAdapter: contract.fallbackAdapter,
    fallbackBehavior: contract.fallbackBehavior,
  }
}

function adapterAvailabilityDiagnostic(
  contract: CodingToolAdapterContractJson,
  status: AdapterAvailabilityStatus,
  missingRequiredFiles: readonly string[],
): AdapterAvailabilityDiagnostic {
  const hostAuth = hostAuthDiagnostic()
  switch (status) {
    case "available":
      return {
        code: "adapter_available",
        message: `${contract.label} is available via '${contract.command}'.`,
        action: "No action required; lfg verified availability without executing the adapter.",
        hostAuth,
      }
    case "missing_command":
      return {
        code: "adapter_command_missing",
        message: `${contract.label} command '${contract.command}' was not found on PATH.`,
        action: `Install or expose '${contract.command}' on PATH, then rerun lfg setup --run or lfg doctor.`,
        hostAuth,
      }
    case "missing_required_files":
      return {
        code: "adapter_config_missing",
        message: `lfg setup files are missing: ${missingRequiredFiles.join(", ")}.`,
        action: "Run lfg setup --run to materialize the Grok plugin and lfg runtime config.",
        hostAuth,
      }
  }
}

function hostAuthDiagnostic(): HostAuthDiagnostic {
  return {
    ownedBy: "grok",
    checked: false,
    note: "Grok host authentication is owned by Grok; lfg does not read or write auth.json during adapter availability checks.",
  }
}

async function requiredFilesStatus(
  home: string,
  pluginPresent: boolean,
): Promise<readonly { readonly path: string; readonly exists: boolean }[]> {
  return [
    { path: "~/.grok/plugins/lfg", exists: pluginPresent },
    { path: "~/.grok/lfg.json", exists: await fileExists(lfgRuntimeConfigPath(home)) },
  ]
}

async function findExecutableInPath(command: string): Promise<string | null> {
  if (isAbsolute(command)) {
    return (await fileExecutable(command)) ? command : null
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir.length === 0) continue
    const candidate = join(dir, command)
    if (await fileExecutable(candidate)) return candidate
  }
  return null
}

async function fileExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
