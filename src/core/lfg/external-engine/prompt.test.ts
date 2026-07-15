import { describe, expect, test } from "vitest"
import { getRoleSpec } from "./omo-roles"
import { buildHandoffPrompt } from "./prompt"

describe("external-engine handoff prompt", () => {
  test("requires the Codex imagegen skill for bitmap visual deliverables", () => {
    // Given
    const input = {
      spec: getRoleSpec("coding"),
      engine: "gpt" as const,
      safetyMode: "write" as const,
      canWrite: true,
      focus: "Draw a product logo",
      deliverable: "A logo image",
      scopePaths: ["assets/"],
      outOfScopePaths: [],
      imagePaths: [],
      acceptanceCriteria: [],
      verifyCommands: [],
      resultPath: ".omo/external-engine/result.md",
    }

    // When
    const prompt = buildHandoffPrompt(input)

    // Then
    expect(prompt).toContain("## IMAGE GENERATION")
    expect(prompt).toContain("$imagegen")
  })
})
