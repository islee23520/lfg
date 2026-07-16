import { describe, expect, test } from "vitest"
import { getRoleSpec } from "./omo-roles"
import { buildHandoffPrompt } from "./prompt"

describe("handoff prompt (natural Codex work)", () => {
  test("requires the Codex imagegen skill for bitmap visual deliverables", () => {
    const prompt = buildHandoffPrompt({
      spec: getRoleSpec("coding"),
      engine: "gpt",
      safetyMode: "write",
      canWrite: true,
      focus: "Draw a product logo",
      deliverable: "A logo image",
      scopePaths: ["assets/"],
      outOfScopePaths: [],
      imagePaths: [],
      acceptanceCriteria: [],
      verifyCommands: [],
      resultPath: null,
    })
    expect(prompt).toContain("## IMAGE GENERATION")
    expect(prompt).toContain("$imagegen")
  })

  test("natural mode omits mandatory external-engine RESULT path", () => {
    const text = buildHandoffPrompt({
      spec: getRoleSpec("coding"),
      engine: "gpt",
      safetyMode: "write",
      canWrite: true,
      focus: "implement board",
      deliverable: "working code",
      scopePaths: [],
      outOfScopePaths: [],
      imagePaths: [],
      acceptanceCriteria: [],
      verifyCommands: [],
      resultPath: null,
    })
    expect(text).toContain("Codex work")
    expect(text).toContain("normal Codex session")
    expect(text).toContain("DONE WHEN")
    expect(text).toContain("No special receipt folder")
    expect(text).not.toMatch(/Write or print RESULT at/)
    expect(text).not.toMatch(/Write or print RESULT at/)
  })

  test("optional receipt path is secondary when provided", () => {
    const text = buildHandoffPrompt({
      spec: getRoleSpec("coding"),
      engine: "gpt",
      safetyMode: "write",
      canWrite: true,
      focus: "fix bug",
      deliverable: "patch",
      scopePaths: [],
      outOfScopePaths: [],
      imagePaths: [],
      acceptanceCriteria: [],
      verifyCommands: [],
      resultPath: ".omo/orchestrator/optional-receipt.md",
    })
    expect(text).toContain("OPTIONAL RECEIPT")
    expect(text).toContain(".omo/orchestrator/optional-receipt.md")
    expect(text).toContain("Primary work remains real project files")
  })
})
