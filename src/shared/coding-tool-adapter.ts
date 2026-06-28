import { type JsonObject } from "./json"

export const CODING_TOOL_ADAPTER_IDS = ["grok", "pi-agent"] as const

export type CodingToolAdapterId = (typeof CODING_TOOL_ADAPTER_IDS)[number]

export type CodingToolAdapterSelection = {
  readonly selected: CodingToolAdapterId
  readonly default: CodingToolAdapterId
  readonly supported: readonly CodingToolAdapterId[]
  readonly contract: CodingToolAdapterContractJson
  readonly executionPlan: CodingToolAdapterExecutionPlanJson
  readonly contracts: Readonly<Record<CodingToolAdapterId, CodingToolAdapterContractJson>>
}

export type CodingToolAdapterContract = {
  readonly id: CodingToolAdapterId
  readonly label: string
  readonly command: string
  readonly args: readonly string[]
  readonly env: readonly string[]
  readonly requiredFiles: readonly string[]
  readonly fallbackAdapter: CodingToolAdapterId | null
  readonly failureBehavior: string
  readonly fallbackBehavior: string
}

export const DEFAULT_CODING_TOOL_ADAPTER: CodingToolAdapterId = "grok"

const CODING_TOOL_ADAPTER_CONTRACTS = {
  grok: {
    id: "grok",
    label: "GrokBuild native adapter",
    command: "grok",
    args: [],
    env: ["HOME"],
    requiredFiles: ["~/.grok/plugins/lfg", "~/.grok/lfg.json"],
    fallbackAdapter: null,
    failureBehavior: "Use GrokBuild host failure semantics; lfg does not own Grok host auth or retry policy.",
    fallbackBehavior: "No lower-level adapter fallback; Grok is the default compatible route.",
  },
  "pi-agent": {
    id: "pi-agent",
    label: "pi-agent adapter",
    command: "pi-agent",
    args: ["run"],
    env: ["HOME", "PATH"],
    requiredFiles: ["~/.grok/plugins/lfg", "~/.grok/lfg.json"],
    fallbackAdapter: null,
    failureBehavior: "Fail closed before execution when pi-agent is unavailable; rerun setup with the grok adapter to switch routes.",
    fallbackBehavior: "No automatic adapter fallback; lfg never launches a different coding tool than the selected adapter.",
  },
} as const satisfies Readonly<Record<CodingToolAdapterId, CodingToolAdapterContract>>

export type CodingToolAdapterContractJson = JsonObject & CodingToolAdapterContract

export type CodingToolAdapterExecutionPlan = {
  readonly selected: CodingToolAdapterId
  readonly mode: "host_command"
  readonly command: string
  readonly argv: readonly string[]
  readonly env: readonly string[]
  readonly requiredFiles: readonly string[]
  readonly executionStatus: "not_executed"
  readonly fallbackAdapter: CodingToolAdapterId | null
  readonly fallbackArgv: readonly string[] | null
  readonly failureBehavior: string
  readonly fallbackBehavior: string
}

export type CodingToolAdapterExecutionPlanJson = JsonObject & CodingToolAdapterExecutionPlan

export function isCodingToolAdapterId(value: unknown): value is CodingToolAdapterId {
  return value === "grok" || value === "pi-agent"
}

export function codingToolAdapterContractJson(adapter: CodingToolAdapterId): CodingToolAdapterContractJson {
  const contract = CODING_TOOL_ADAPTER_CONTRACTS[adapter]
  return {
    id: contract.id,
    label: contract.label,
    command: contract.command,
    args: [...contract.args],
    env: [...contract.env],
    requiredFiles: [...contract.requiredFiles],
    fallbackAdapter: contract.fallbackAdapter,
    failureBehavior: contract.failureBehavior,
    fallbackBehavior: contract.fallbackBehavior,
  }
}

export function codingToolAdapterContractsJson(): Readonly<Record<CodingToolAdapterId, CodingToolAdapterContractJson>> {
  return {
    grok: codingToolAdapterContractJson("grok"),
    "pi-agent": codingToolAdapterContractJson("pi-agent"),
  }
}

export function codingToolAdapterExecutionPlanJson(adapter: CodingToolAdapterId): CodingToolAdapterExecutionPlanJson {
  const contract = codingToolAdapterContractJson(adapter)
  const fallbackArgv = contract.fallbackAdapter === null
    ? null
    : [CODING_TOOL_ADAPTER_CONTRACTS[contract.fallbackAdapter].command, ...CODING_TOOL_ADAPTER_CONTRACTS[contract.fallbackAdapter].args]
  return {
    selected: adapter,
    mode: "host_command",
    command: contract.command,
    argv: [contract.command, ...contract.args],
    env: [...contract.env],
    requiredFiles: [...contract.requiredFiles],
    executionStatus: "not_executed",
    fallbackAdapter: contract.fallbackAdapter,
    fallbackArgv,
    failureBehavior: contract.failureBehavior,
    fallbackBehavior: contract.fallbackBehavior,
  }
}

export function codingToolAdapterSelectionJson(
  selected: CodingToolAdapterId = DEFAULT_CODING_TOOL_ADAPTER,
): JsonObject {
  return {
    selected,
    default: DEFAULT_CODING_TOOL_ADAPTER,
    supported: [...CODING_TOOL_ADAPTER_IDS],
    contract: codingToolAdapterContractJson(selected),
    executionPlan: codingToolAdapterExecutionPlanJson(selected),
    contracts: codingToolAdapterContractsJson(),
  }
}
