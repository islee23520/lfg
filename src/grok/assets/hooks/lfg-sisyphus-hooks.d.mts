export interface SisyphusContext {
  readonly statusLabel: string
  readonly body: string
}

export interface EvidenceResult {
  readonly status: "verified" | "missing_evidence" | "weak_evidence"
  readonly missing: readonly string[]
  readonly weak: readonly string[]
}

export function renderSisyphusContext(
  event: string,
  input: Record<string, unknown> | null,
): SisyphusContext | null

export function subagentStopContext(
  input?: Record<string, unknown> | null | string,
): SisyphusContext

export function verifySubagentEvidence(
  input: Record<string, unknown> | null | string,
): EvidenceResult

export interface SubagentStopEvidenceResult {
  readonly hasReceipt: boolean
  readonly additionalContext?: string
  readonly warning?: string
}

export function verifySubagentStopEvidence(
  payload: unknown,
  cwd?: string,
): SubagentStopEvidenceResult

export function runHook(input: Record<string, unknown> | null): Promise<void>
