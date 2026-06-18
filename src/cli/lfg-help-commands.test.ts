import { describe, expect, test } from "vitest"
import { runLfgText } from "./test-process"

describe("lfg help", () => {
  test("automation section advertises setup surfaces only", async () => {
    const result = await runLfgText(["help"], "", {})
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg --json setup")
    expect(result.stdout).toContain("lfg --json setup --run --force")
    expect(result.stdout).toContain("Setup run implementation:")
    expect(result.stdout).toContain("@islee23520/lfg internal grok-install")
    expect(result.stdout).not.toContain("npx lazycodex-ai install")
    expect(result.stdout).not.toContain("project-local")
    expect(result.stdout).not.toContain("doctor")
  })
})
