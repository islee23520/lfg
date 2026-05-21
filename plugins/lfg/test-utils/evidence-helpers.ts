import { expect } from "bun:test"

export function expectEvidenceString(output: string, evidence: `${string}=ok`): void {
  expect(output.split(/\r?\n/)).toContain(evidence)
}

export function collectEvidenceStrings(output: string): string[] {
  return output.split(/\r?\n/).filter((line) => /^[A-Za-z0-9_.-]+=ok$/.test(line))
}

export function assertEvidenceStrings(output: string, expected: readonly `${string}=ok`[]): void {
  for (const item of expected) expectEvidenceString(output, item)
}
