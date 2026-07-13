import { describe, expect, test } from "vitest"
import {
  NATIVE_OMO_AGENT_NAMES,
  nativeOmoFallbackPrompt,
} from "./native-omo-agents"

describe("native OMO agents", () => {
  test("maps upstream OMO builtins plus Grok convenience role agents", () => {
    expect(NATIVE_OMO_AGENT_NAMES).toEqual([
      "default",
      "sisyphus",
      "hephaestus",
      "prometheus",
      "atlas",
      "oracle",
      "multimodal-looker",
      "sisyphus-junior",
      "explorer",
      "librarian",
      "metis",
      "momus",
      "reasoning",
      "coding",
      "plan",
      "reviewer",
    ])
  })

  test("renders Grok-native prompt markers for dynamic Sisyphus surfaces", () => {
    expect(nativeOmoFallbackPrompt("default")).toContain("OMO Sisyphus")
    expect(nativeOmoFallbackPrompt("sisyphus")).toContain("OMO Sisyphus")
    expect(nativeOmoFallbackPrompt("sisyphus")).toMatch(/NO RE-ASK|over-ask|at most ONE/i)
    expect(nativeOmoFallbackPrompt("sisyphus")).toMatch(/SELF-ANSWER/i)
    expect(nativeOmoFallbackPrompt("hephaestus")).toContain("OMO Hephaestus")
    expect(nativeOmoFallbackPrompt("prometheus")).toContain("OMO Prometheus")
    expect(nativeOmoFallbackPrompt("atlas")).toContain("OMO Atlas")
    expect(nativeOmoFallbackPrompt("oracle")).toContain("OMO Oracle")
    expect(nativeOmoFallbackPrompt("multimodal-looker")).toContain("OMO Multimodal-Looker")
    expect(nativeOmoFallbackPrompt("sisyphus-junior")).toContain("OMO Sisyphus-Junior")
  })
})
