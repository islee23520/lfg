import { describe, expect, test } from "vitest"
import { unsupportedCommand } from "./lfg-command"

describe("lfg supported commands", () => {
  test("unsupported JSON lists setup only", () => {
    const json = unsupportedCommand(["dry-setup"])
    expect(json.supportedCommands).toEqual(["setup", "doctor", "set-tier", "xai", "zai", "mcp", "claude", "ulw", "ulw-loop"])
  })
})
