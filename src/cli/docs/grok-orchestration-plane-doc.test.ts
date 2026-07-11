import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/grok-orchestration-plane.md", () => {
  test("full-picture of OMO/senpi control planes for Grok", async () => {
    const text = await readFile(join(ROOT, "docs/grok-orchestration-plane.md"), "utf8")

    // Required invariants and gaps
    expect(text).toContain("app-server is NOT an lfg runtime dependency")
    expect(text).toContain("teammode deferred until Grok-native team (codex_app not available)")
    expect(text).toContain("multi_agent_v1 ≠ codex_app (different planes)")
    expect(text).toContain("lfg uses spawn_subagent")
    expect(text).toContain("pi-agent run ≠ omo-senpi without proof")

    // Must NOT claim forbidden app-server ownership
    expect(text).not.toContain("Grok has app-server")
    expect(text).not.toContain("Grok possesses app-server")

    // teammode spawn_subagent adaptation (dual catalogs)
    expect(text).toContain("spawn_subagent")
    expect(text).toContain("general-purpose")
    expect(text).toContain("Grok-adapted")
    expect(text).toContain("host built-ins")

    // Core framing and links
    expect(text).toContain("Grok Orchestration Plane (Full-Picture ADR)")
    expect(text).toContain(".omo/ultraresearch/20260709-123633/SYNTHESIS.md")
    expect(text).toContain("grok-adapter-core-port-strategy.md")
    expect(text).toContain("omo-grokbuild-pi-agent-parity-adr.md")
    expect(text).toContain("Orchestration in lfg routes through GrokBuild native primitives")
    expect(text).toContain("delegate-core")
    expect(text).toContain("boulder-state")
    expect(text).toContain("Full team/task RPC parity")

    // Section coverage
    expect(text).toContain("(A) codex app-server QA plane")
    expect(text).toContain("(B) codex_app team threads")
    expect(text).toContain("(C) multi_agent_v1 subagent plane")
    expect(text).toContain("(D) senpi app-server reverse-engineering")
    expect(text).toContain("(E) omo-senpi task/team RPC")
    expect(text).toContain("(F) lfg spawn_subagent + current gaps")
    expect(text).toContain("QA harness infrastructure only")
    expect(text).toContain("teammode remains deferred")
    expect(text).toContain("distinct orchestration layers")
    expect(text).toContain("reverse-engineered")
    expect(text).toContain("RPC child processes")
    expect(text).toContain("No app-server control plane")

    // Status and parity discipline
    expect(text).toContain("**Status:** Draft (2026-07-09")
    expect(text).toContain("explicitly not claimed")
    expect(text).toContain("pi-agent run route provides launch/auth only")

    // MVP substitute classification (#74 pass conditions 1+2)
    expect(text).toContain("MVP substitute classification")
    expect(text).toContain("Host dependency class")
    expect(text).toContain("MVP substitute shipped")
    expect(text).toContain("teammode")
    expect(text).toContain("start-work-continuation")
    expect(text).toContain("lazycodex-executor-verify")
    expect(text).toContain("Sisyphus native Stop/SubagentStop hooks")
    expect(text).toContain("subagent-stop-evidence-verifier.ts")
    expect(text).toContain("lfg ulw-loop")
    expect(text).toContain("verifySubagentEvidence")

    // Z.AI vision shipped (#89)
    expect(text).toContain("Z.AI vision MCP is **shipped**")
    expect(text).toContain("lfg zai mcp install vision")
  })
})
