import { describe, expect, test } from "vitest"
import {
  NATIVE_OMO_AGENT_NAMES,
  nativeAgentDescription,
  nativeOmoFallbackPrompt,
} from "./native-omo-agents"
import { LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG } from "./native-agent-permissions"

describe("diet native agents", () => {
  test("keeps slim native agents including git-master", () => {
    expect(NATIVE_OMO_AGENT_NAMES).toEqual([
      "sisyphus",
      "watcher",
      "explorer",
      "git-master",
    ])
    const sisyphusPrompt = nativeOmoFallbackPrompt("sisyphus")
    expect(sisyphusPrompt).toContain('<lfg-sisyphus-ceo-protocol force="true">')
    expect(sisyphusPrompt).toContain("lfg --json handoff plan --role coding --engine gpt --focus")
    expect(sisyphusPrompt).toContain("handoff.launch.argv")
    expect(sisyphusPrompt).toContain("RESULT")
    expect(sisyphusPrompt).toContain(LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG)
    expect(nativeOmoFallbackPrompt("watcher")).toContain("orchestrator status")
    expect(nativeOmoFallbackPrompt("watcher")).toContain("HARD REQUIREMENT")
    expect(nativeOmoFallbackPrompt("watcher")).toContain("MUST NOT implement")
    expect(nativeOmoFallbackPrompt("explorer")).toContain("read-only")
    expect(nativeOmoFallbackPrompt("git-master")).toContain("git operations only")
    expect(nativeAgentDescription("git-master")).toContain("Git-only")
    expect(nativeAgentDescription("sisyphus")).toContain("CEO")
  })
})
