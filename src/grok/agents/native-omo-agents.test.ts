import { describe, expect, test } from "vitest"
import {
  NATIVE_OMO_AGENT_NAMES,
  nativeAgentDescription,
  nativeOmoFallbackPrompt,
} from "./native-omo-agents"
import { LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG } from "./native-agent-permissions"

describe("diet native agents", () => {
  test("keeps only the thin Sisyphus native agent", () => {
    expect(NATIVE_OMO_AGENT_NAMES).toEqual(["sisyphus"])
    const sisyphusPrompt = nativeOmoFallbackPrompt("sisyphus")
    expect(sisyphusPrompt).toContain('<lfg-sisyphus-ceo-protocol force="true">')
    expect(sisyphusPrompt).toContain("lfg --json goal drive --skill ulw-loop --skill programming --focus")
    expect(sisyphusPrompt).toContain("create the current session goals")
    expect(sisyphusPrompt).toContain("RESULT")
    expect(sisyphusPrompt).toContain(LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG)
    expect(nativeAgentDescription("sisyphus")).toContain("CEO")
  })
})
