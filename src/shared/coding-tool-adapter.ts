import { type JsonObject } from "./json"

/** lfg is GrokBuild-only. No pi-agent / multi-host coding-tool adapters. */
export const CODING_TOOL_ADAPTER_IDS = ["grok"] as const

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

const GROK_ADAPTER_CONTRACT = {
  id: "grok",
  label: "GrokBuild native adapter",
  command: "grok",
  args: [],
  env: ["HOME"],
  requiredFiles: ["~/.grok/plugins/lfg", "~/.grok/config.toml"],
  fallbackAdapter: null,
  failureBehavior: "Use GrokBuild host failure semantics; lfg does not own Grok host auth or retry policy.",
  fallbackBehavior: "No alternate coding-tool adapter; lfg is Grok-only.",
} as const satisfies CodingToolAdapterContract

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
  return value === "grok"
}

/** Coerce legacy stored ids (e.g. pi-agent) to the only supported adapter. */
export function normalizeCodingToolAdapterId(value: unknown): CodingToolAdapterId {
  return value === "grok" ? "grok" : DEFAULT_CODING_TOOL_ADAPTER
}

export function codingToolAdapterContractJson(adapter: CodingToolAdapterId = DEFAULT_CODING_TOOL_ADAPTER): CodingToolAdapterContractJson {
  void adapter
  return {
    id: GROK_ADAPTER_CONTRACT.id,
    label: GROK_ADAPTER_CONTRACT.label,
    command: GROK_ADAPTER_CONTRACT.command,
    args: [...GROK_ADAPTER_CONTRACT.args],
    env: [...GROK_ADAPTER_CONTRACT.env],
    requiredFiles: [...GROK_ADAPTER_CONTRACT.requiredFiles],
    fallbackAdapter: GROK_ADAPTER_CONTRACT.fallbackAdapter,
    failureBehavior: GROK_ADAPTER_CONTRACT.failureBehavior,
    fallbackBehavior: GROK_ADAPTER_CONTRACT.fallbackBehavior,
  }
}

export function codingToolAdapterContractsJson(): Readonly<Record<CodingToolAdapterId, CodingToolAdapterContractJson>> {
  return {
    grok: codingToolAdapterContractJson("grok"),
  }
}

export function codingToolAdapterExecutionPlanJson(adapter: CodingToolAdapterId = DEFAULT_CODING_TOOL_ADAPTER): CodingToolAdapterExecutionPlanJson {
  const contract = codingToolAdapterContractJson(adapter)
  return {
    selected: "grok",
    mode: "host_command",
    command: contract.command,
    argv: [contract.command, ...contract.args],
    env: [...contract.env],
    requiredFiles: [...contract.requiredFiles],
    executionStatus: "not_executed",
    fallbackAdapter: null,
    fallbackArgv: null,
    failureBehavior: contract.failureBehavior,
    fallbackBehavior: contract.fallbackBehavior,
  }
}

export function codingToolAdapterSelectionJson(
  selected: CodingToolAdapterId = DEFAULT_CODING_TOOL_ADAPTER,
): JsonObject {
  return {
    selected: normalizeCodingToolAdapterId(selected),
    default: DEFAULT_CODING_TOOL_ADAPTER,
    supported: [...CODING_TOOL_ADAPTER_IDS],
    contract: codingToolAdapterContractJson("grok"),
    executionPlan: codingToolAdapterExecutionPlanJson("grok"),
    contracts: codingToolAdapterContractsJson(),
  }
}
