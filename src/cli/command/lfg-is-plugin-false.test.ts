import { describe, expect, test } from "vitest"
import { runLfg } from "../test/test-process"

describe("lfg ownership (plan DoD)", () => {
  test("setup plan JSON keeps lfgIsPlugin false", async () => {
    const plan = await runLfg(["--json", "setup"], {})
    expect(plan.json).toMatchObject({ lfgIsPlugin: false })
  })

  test("unsupported legacy commands keep lfgIsPlugin false", async () => {
    const result = await runLfg(["--json", "doctor"], {})
    expect(result.json).toMatchObject({ lfgIsPlugin: false, command: "doctor", supportedCommands: ["setup", "xai", "zai", "mcp", "ulw", "ulw-loop"] })
  })
})
