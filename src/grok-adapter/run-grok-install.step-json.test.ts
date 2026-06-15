import { describe, expect, test } from "vitest"
import {
  INTERNAL_GROK_INSTALL_COMMAND,
  INTERNAL_GROK_INSTALL_PACKAGE,
  grokInstallStepJson,
} from "./run-grok-install"

describe("grokInstallStepJson", () => {
  test("maps internal install step for setup installers array", () => {
    const json = grokInstallStepJson({
      ok: true,
      exitCode: 0,
      stdout: "internal grok install -> /tmp/x",
      stderr: "",
    })
    expect(json).toMatchObject({
      packageName: INTERNAL_GROK_INSTALL_PACKAGE,
      command: INTERNAL_GROK_INSTALL_COMMAND,
      args: [],
      exitCode: 0,
    })
    expect(String(json.command)).not.toContain("@islee23520/lfp")
  })
})