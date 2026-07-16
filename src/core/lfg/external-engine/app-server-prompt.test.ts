import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { buildAppServerTurnPrompt } from "./app-server-prompt"

describe("buildAppServerTurnPrompt", () => {
  test("returns worker template alone when no payload file", async () => {
    const turn = await buildAppServerTurnPrompt({
      workerPrompt: "# TEMPLATE\nDo work",
      focus: "short focus",
    })
    expect(turn.prompt).toBe("# TEMPLATE\nDo work")
    expect(turn.goalObjective).toBe("short focus")
    expect(turn.includedPayloadFile).toBeNull()
    expect(turn.payloadMissing).toBe(false)
  })

  test("embeds full payload body into app-server turn text", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-app-server-prompt-"))
    const payload = join(root, "R42-payload.md")
    await writeFile(payload, "# R42 FULL BRIEF\n\nImplement the board writer with TDD.\n", "utf8")

    const turn = await buildAppServerTurnPrompt({
      workerPrompt: "# OMO TEMPLATE\nGeneric scaffold only.",
      focus: "G001 board",
      payloadFile: payload,
      cwd: root,
    })

    expect(turn.prompt).toContain("OMO TEMPLATE")
    expect(turn.prompt).toContain("FULL TASK PAYLOAD")
    expect(turn.prompt).toContain("R42 FULL BRIEF")
    expect(turn.prompt).toContain("Implement the board writer with TDD.")
    expect(turn.includedPayloadFile).toBe(payload)
    expect(turn.goalObjective).toBe("G001 board")
    expect(turn.payloadMissing).toBe(false)
  })

  test("warns when payload file is missing", async () => {
    const turn = await buildAppServerTurnPrompt({
      workerPrompt: "template",
      focus: "x",
      payloadFile: "/no/such/payload.md",
      cwd: process.cwd(),
    })
    expect(turn.payloadMissing).toBe(true)
    expect(turn.prompt).toContain("unreadable")
  })
})
