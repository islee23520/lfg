import { describe, expect, test } from "vitest"
import { unsupportedCommand } from "./lfg-command"

describe("lfg supported commands", () => {
  test("unsupported JSON lists setup, doctor, project-local", () => {
    const json = unsupportedCommand(["dry-setup"])
    expect(json.supportedCommands).toEqual(["setup", "doctor", "project-local"])
  })
})