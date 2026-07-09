import { describe, expect, test } from "vitest"
import {
  BACK_SELECTION,
  groupModelAliases,
  logAgentGuide,
  parseListedSelection,
  printModelChoices,
  promptForModel,
  promptForReasoningEffort,
  promptForServiceTier,
  REASONING_EFFORTS,
  SERVICE_TIERS,
} from "./model-config-prompts"

describe("model-config-prompts (LFP parity under Grok)", () => {
  test("SERVICE_TIERS and REASONING_EFFORTS match LFP vocabulary", () => {
    expect(SERVICE_TIERS.map((t) => t.value)).toEqual(["default", "fast"])
    expect([...REASONING_EFFORTS]).toEqual(["low", "medium", "high", "xhigh"])
  })

  test("logAgentGuide prints recommendation + Enter-to-keep semantics", () => {
    const lines: string[] = []
    logAgentGuide(
      { write: (c) => lines.push(c) },
      "explorer",
      { model: "grok-3", reasoning: "low", tier: "fast" },
      {
        recommended: "grok-4-fast",
        rationale: "Best available explorer route.",
        alternatives: ["grok-3-mini-fast"],
        perfLine: "(120ms, 80t/s)",
      },
    )
    const text = lines.join("")
    expect(text).toContain("Agent: explorer")
    expect(text).toContain("Current: grok-3")
    expect(text).toContain("Recommended: grok-4-fast (120ms, 80t/s)")
    expect(text).toContain("Why: Best available explorer route.")
    expect(text).toContain("Alternatives: grok-3-mini-fast")
    expect(text).toContain("Press Enter to keep the recommended model.")
  })

  test("logAgentGuide preferCurrent keeps OMO/Grok value wording", () => {
    const lines: string[] = []
    logAgentGuide(
      { write: (c) => lines.push(c) },
      "reasoning",
      { model: "kept", reasoning: "high", tier: "default" },
      { preferCurrent: true },
    )
    expect(lines.join("")).toContain("press Enter to leave it unchanged")
  })

  test("parseListedSelection supports index, exact, bare id, back, empty", () => {
    const models = ["xai/grok-3", "openai/gpt-5"]
    expect(parseListedSelection("", models)).toBeNull()
    expect(parseListedSelection("1", models)).toBe("xai/grok-3")
    expect(parseListedSelection("gpt-5", models)).toBe("openai/gpt-5")
    expect(parseListedSelection("back", models)).toBe(BACK_SELECTION)
    expect(parseListedSelection("nope", models)).toBeNull()
  })

  test("groupModelAliases groups provider prefixes by bare id", () => {
    const grouped = groupModelAliases(["xai/grok-3", "grok-3", "openai/gpt-5"])
    expect(grouped.find((g) => g.key === "grok-3")?.aliases).toEqual(["grok-3", "xai/grok-3"])
  })

  test("printModelChoices writes numbered list", () => {
    const lines: string[] = []
    printModelChoices(["grok-3", "gpt-5"], { write: (c) => lines.push(c) })
    expect(lines.join("")).toContain("1) grok-3")
    expect(lines.join("")).toContain("2) gpt-5")
  })

  test("promptForModel Enter keeps recommended", async () => {
    const selected = await promptForModel(
      { question: async () => "" },
      ["grok-a", "grok-b"],
      { recommended: "grok-b", current: "grok-a" },
    )
    expect(selected).toBe("grok-b")
  })

  test("promptForServiceTier and promptForReasoningEffort Enter keep current", async () => {
    expect(
      await promptForServiceTier({ question: async () => "" }, { current: "fast" }),
    ).toBe("fast")
    expect(
      await promptForReasoningEffort({ question: async () => "" }, { current: "high" }),
    ).toBe("high")
    expect(await promptForReasoningEffort({ question: async () => "2" }, {})).toBe("medium")
  })

  test("injectable selectors short-circuit readline", async () => {
    expect(
      await promptForModel(null, ["a"], {
        modelSelector: async () => "a",
      }),
    ).toBe("a")
  })
})
