import { describe, expect, test } from "bun:test"
import { buildContinuationPrompt, createLfgTypescriptRuntime, detectUlwIntent, runLfgTypescriptUlw } from "./index"

describe("LFG TypeScript runtime", () => {
  test("runs the OMO ULW loop contract", async () => {
    const result = await runLfgTypescriptUlw()

    expect(result.prompts).toHaveLength(3)
    expect(result.prompts[0]).toBe("ULTRAWORK MODE ENABLED!")
    expect(result.prompts[1]).toContain("RALPH LOOP 2/500")
    expect(result.prompts[2]).toContain("ULTRAWORK LOOP VERIFICATION")
    expect(result.finalState).toBeNull()
  })

  test("detects ULW outside code spans", () => {
    expect(detectUlwIntent("please ulw this")).toBe(true)
    expect(detectUlwIntent("`ulw` is documentation")).toBe(false)
  })

  test("keeps host state in memory", async () => {
    const runtime = createLfgTypescriptRuntime()
    await runtime.submitUserMessage({ sessionID: "session", text: "please ultrawork" })
    await runtime.emitIdle("session")

    expect(runtime.state()?.iteration).toBe(2)
    expect(runtime.readMessages("missing")).toEqual([])
    expect(runtime.readMessages("session").some((message) => message.text.includes("RALPH LOOP 2/500"))).toBe(true)
  })

  test("builds verification prompt", () => {
    const prompt = buildContinuationPrompt({
      active: true,
      iteration: 2,
      maxIterations: 500,
      completionPromise: "VERIFIED",
      initialCompletionPromise: "DONE",
      prompt: "ship lfg ts",
      sessionID: "session",
      ultrawork: true,
      verificationPending: true,
    })

    expect(prompt).toContain("ULTRAWORK LOOP VERIFICATION 2/500")
    expect(prompt).toContain("<promise>DONE</promise>")
  })
})
