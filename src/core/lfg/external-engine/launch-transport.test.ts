import { describe, expect, test } from "vitest"
import { buildHandoffLaunch } from "./launch"

describe("Codex-only launch transport", () => {
  test("launches codex exec with the requested safety mode", () => {
    const plan = buildHandoffLaunch({ engine: "gpt", canWrite: false, yolo: false, cwd: "/repo", workerPrompt: "work" })
    expect(plan.binary).toBe("codex")
    expect(plan.argv).toEqual(["codex", "exec", "--sandbox", "read-only", "--cd", "/repo", "work"])
  })
})
