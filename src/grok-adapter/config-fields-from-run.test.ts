import { describe, expect, test } from "vitest"
import { configFieldsFromRun } from "./run-grok-install"

describe("configFieldsFromRun (#29)", () => {
  test("empty when config not written", () => {
    expect(configFieldsFromRun(null)).toEqual({})
  })

  test("includes grokConfig when configured", () => {
    const fields = configFieldsFromRun({
      status: "configured",
      path: "/home/.grok/config.toml",
      modelsBaseUrl: "http://127.0.0.1/v1",
    })
    expect(fields).toMatchObject({
      configUpdated: true,
      configPath: "/home/.grok/config.toml",
      grokConfig: { status: "configured" },
    })
  })
})