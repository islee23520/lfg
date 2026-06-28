import {
  CODING_TOOL_ADAPTER_IDS,
  codingToolAdapterContractJson,
  codingToolAdapterExecutionPlanJson,
  DEFAULT_CODING_TOOL_ADAPTER,
  type CodingToolAdapterId,
} from "../../shared/coding-tool-adapter"

export type CodingToolAdapterTuiOption = {
  readonly value: CodingToolAdapterId
  readonly label: string
  readonly hint: string
}

export function codingToolAdapterTuiOptions(): readonly CodingToolAdapterTuiOption[] {
  return CODING_TOOL_ADAPTER_IDS.map((adapter) => {
    const contract = codingToolAdapterContractJson(adapter)
    return {
      value: adapter,
      label: contract.label,
      hint: adapter === DEFAULT_CODING_TOOL_ADAPTER ? "default" : `compatible fallback: ${contract.fallbackAdapter ?? "none"}`,
    }
  })
}

export function formatCodingToolAdapterSummary(adapter: CodingToolAdapterId): string {
  const plan = codingToolAdapterExecutionPlanJson(adapter)
  const fallback = plan.fallbackArgv === null ? "none" : plan.fallbackArgv.join(" ")
  return `Coding adapter: ${adapter} -> ${plan.argv.join(" ")} (fallback: ${fallback})`
}
