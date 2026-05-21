export type EvidenceContract = {
  evidence: string
  description: string
}

export const SELF_TEST_EVIDENCE: EvidenceContract[] = [
  { evidence: "manifest-and-file-checks=ok", description: "JSON manifests, required files, hook registration, workflow, and MCP loader contracts are valid." },
  { evidence: "marketplace-metadata=ok", description: "Grok and Agents marketplace metadata preserve the lfg package identity." },
  { evidence: "manifest-reference-alignment=ok", description: "Grok and Claude plugin manifests are materialized identically." },
  { evidence: "marketplace-reference-alignment=ok", description: "Grok and Agents marketplace reference fields stay aligned." },
  { evidence: "release-notes=ok", description: "Marketplace release notes and install docs retain required package/source references." },
  { evidence: "marketplace-source=ok", description: "Marketplace source entries point at plugins/lfg with the expected metadata." },
  { evidence: "agents-guides-valid=ok", description: "All five AGENTS.md guides are structurally complete and avoid removed shell gate language." },
  { evidence: "hook-smoke=ok", description: "Audit hook writes an event log while redacting token-like secrets." },
  { evidence: "hook-bridge-smoke=ok", description: "Hook bridge smoke gate passes." },
  { evidence: "todo-continuation=ok", description: "Todo continuation hook contract remains covered by the hook bridge smoke gate." },
  { evidence: "mcp-smoke=ok", description: "MCP server initializes, lists canonical tools, and handles short tool calls." },
  { evidence: "mcp-stdio-isolation=ok", description: "MCP stdout remains JSON-RPC only for the smoke exchange." },
  { evidence: "mcp-stderr-isolated=ok", description: "MCP diagnostics stay isolated from stdout." },
  { evidence: "mcp-legacy-alias=ok", description: "Legacy grok_build_* MCP aliases remain accepted without being listed as canonical tools." },
  { evidence: "state-schema-versioning=ok", description: "Runtime doctor reports the expected state schema check." },
  { evidence: "state-schema-doctor=ok", description: "Runtime doctor passes catalog and state diagnostics." },
  { evidence: "continuation-gate=ok", description: "Loop start writes a durable manual-gate dispatch artifact." },
  { evidence: "team-dry-run=ok", description: "Team dry-run planning works with deterministic noop providers." },
  { evidence: "models-auth=ok", description: "Models/auth surfaces store environment variable names only, not secrets." },
  { evidence: "ultrawork-stop-conditions=ok", description: "Ultrawork accepted/manual stop states require evidence artifacts and Grok Oracle review." },
  { evidence: "team-tmux-lifecycle=ok", description: "Bounded local tmux lifecycle create/status/resume/shutdown succeeds." },
  { evidence: "runtime-smoke-coverage=100%", description: "The TypeScript runtime smoke matrix remains fully passing." },
  { evidence: "tiers-5tier-mapping=ok", description: "OMO 5-tier hook parity evidence remains present." },
  { evidence: "dispatch-gate=ok", description: "Dispatch gate parity evidence remains present." },
  { evidence: "agent-behavior-hook-parity=ok", description: "Agent behavior hook parity evidence remains present." },
]

export const EXPECTED_EVIDENCE_STRINGS = SELF_TEST_EVIDENCE.map((entry) => entry.evidence)

export function isEvidenceLine(line: string): boolean {
  return /^[a-z][-a-z0-9]+=ok(?:\b.*)?$/.test(line) || line === "runtime-smoke-coverage=100%"
}
