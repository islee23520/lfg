import { describe, expect, test } from "vitest"
import { dispatchMcpCompanionCommand } from "./companion-command"

describe("dispatchMcpCompanionCommand", () => {
  test("help lists companion package", async () => {
    const text = await dispatchMcpCompanionCommand("help", { json: false })
    expect(String(text)).toContain("@islee23520/lfg-mcp")
    expect(String(text)).toContain("companion install")
  })

  test("status runs local companion when checkout exists", async () => {
    const result = await dispatchMcpCompanionCommand("status", { json: true })
    expect(result).toBeTypeOf("object")
    // local ULW/lfg-mcp checkout should respond as doctor JSON
    if (typeof result === "object" && result !== null && "catalog" in result) {
      expect(Array.isArray((result as { catalog: unknown }).catalog)).toBe(true)
    }
  })
})
