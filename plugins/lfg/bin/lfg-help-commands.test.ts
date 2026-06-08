import { describe, expect, test } from "vitest"
import { runLfgText } from "./test-process"

describe("lfg help", () => {
  test("automation section lists project-local", async () => {
    const result = await runLfgText(["help"], "", {})
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("project-local")
    expect(result.stdout).toContain("doctor")
  })
})