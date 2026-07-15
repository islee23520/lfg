import { describe, expect, test } from "vitest"
import {
  LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG,
  isReadOnlyNativeAgent,
  nativeAgentCapabilityMode,
  nativeAgentPermissionMode,
  nativeAgentPermissionPolicyBlock,
  READ_ONLY_NATIVE_AGENT_NAMES,
} from "./native-agent-permissions"
import { nativeOmoFallbackPrompt } from "./native-omo-agents"
import { renderMinimalGrokRoleToml } from "./codex-agent-toml-to-grok"

describe("native agent permissions", () => {
  test("sisyphus/watcher/explorer are forced read-only", () => {
    expect([...READ_ONLY_NATIVE_AGENT_NAMES]).toEqual(["sisyphus", "watcher", "explorer"])
    for (const name of READ_ONLY_NATIVE_AGENT_NAMES) {
      expect(isReadOnlyNativeAgent(name)).toBe(true)
      expect(nativeAgentPermissionMode(name)).toBe("plan")
      expect(nativeAgentCapabilityMode(name)).toBe("read-only")
      expect(nativeAgentPermissionPolicyBlock(name)).toContain("FORBIDDEN")
      expect(nativeAgentPermissionPolicyBlock(name)).toMatch(/LazyCodex|Codex/)
    }
    expect(nativeAgentCapabilityMode("git-master")).toBe("execute")
    expect(nativeAgentPermissionMode("git-master")).toBe("default")
    expect(nativeAgentPermissionPolicyBlock("git-master")).toContain("git specialist")
    expect(nativeAgentPermissionPolicyBlock("git-master")).toContain("FORBIDDEN: product feature")
  })

  test("fallback prompts embed permission + CEO judgment policy", () => {
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("MUST NOT edit")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("<lfg-agent-permissions>")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("CEO")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("doubt")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("<lfg-ceo-judgment-policy>")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("<lfg-ceo-mandatory-commands>")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("lfg --json orchestrator status")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("lfg --json orchestrator poll")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("lfg --json orchestrator answer")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("handoff plan")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain(LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG)
    expect(nativeOmoFallbackPrompt("watcher")).toContain(LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG)
    expect(nativeOmoFallbackPrompt("watcher")).toContain("lfg --json orchestrator status")
    expect(nativeOmoFallbackPrompt("watcher")).toContain("MUST NOT implement")
    expect(nativeOmoFallbackPrompt("explorer")).toContain("read-only")
    expect(nativeOmoFallbackPrompt("git-master")).toContain("git operations only")
  })

  test("minimal role toml forces capability modes", () => {
    const override = { model: "inherit", reasoningLevel: "medium" as const }
    expect(renderMinimalGrokRoleToml("sisyphus", override)).toContain('default_capability_mode = "read-only"')
    expect(renderMinimalGrokRoleToml("watcher", override)).toContain('default_capability_mode = "read-only"')
    expect(renderMinimalGrokRoleToml("explorer", override)).toContain('default_capability_mode = "read-only"')
    expect(renderMinimalGrokRoleToml("git-master", override)).toContain('default_capability_mode = "execute"')
  })
})
