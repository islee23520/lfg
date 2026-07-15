import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  confirmVisionWithAgy,
  parseAgyVisionVerdict,
  planAgyVisionConfirmation,
} from "./vision-confirmation"

describe("agy vision confirmation gateway", () => {
  test("requests confirmation for visual roles with image evidence", () => {
    const result = planAgyVisionConfirmation({ role: "visual_qa", imagePaths: ["screens/after.png"] })
    expect(result).toMatchObject({ requested: true, reason: "visual_role", optional: true, blocking: false })
  })

  test("requests confirmation for visual keywords with image evidence", () => {
    const result = planAgyVisionConfirmation({
      role: "coding",
      focus: "Confirm the UI screenshot matches the request",
      imagePaths: ["screens/after.png"],
    })
    expect(result).toMatchObject({ requested: true, reason: "visual_keyword" })
  })

  test("does not request confirmation without image evidence", () => {
    const result = planAgyVisionConfirmation({ role: "vision", focus: "visual qa", imagePaths: [] })
    expect(result).toMatchObject({ requested: false, reason: "no_images" })
  })

  test("returns skipped without failing when agy is missing", async () => {
    const plan = planAgyVisionConfirmation({ role: "vision", imagePaths: ["shot.png"] })
    const result = await confirmVisionWithAgy(plan, { env: { PATH: "" } })
    expect(result).toMatchObject({ status: "skipped", blocking: false, commandPath: null })
  })

  test("runs bounded agy print confirmation with image flags", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-agy-confirm-"))
    const bin = join(root, "bin")
    await mkdir(bin)
    const agy = join(bin, "agy")
    await writeFile(agy, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
    const calls: { readonly args: readonly string[]; readonly timeoutMs: number }[] = []
    const plan = planAgyVisionConfirmation({ role: "multimodal", imagePaths: ["one.png", "two.jpg"] })
    const result = await confirmVisionWithAgy(plan, {
      env: { PATH: bin },
      timeoutMs: 3210,
      runner: async (input) => {
        calls.push({ args: input.args, timeoutMs: input.timeoutMs })
        return { stdout: "PASS: evidence matches", stderr: "" }
      },
    })
    expect(result.status).toBe("pass")
    expect(calls).toEqual([{ args: expect.arrayContaining(["--print", "--image", "one.png", "two.jpg"]), timeoutMs: 3210 }])
    expect(result.contextBlock).toContain("<lfg-agy-vision-confirm>")
  })

  test("normalizes failed execution and ambiguous output to uncertain", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-agy-error-"))
    const agy = join(root, "agy")
    await writeFile(agy, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
    const plan = planAgyVisionConfirmation({ role: "vision", imagePaths: ["shot.png"] })
    const result = await confirmVisionWithAgy(plan, {
      env: { PATH: root },
      runner: async () => { throw new Error("timed out") },
    })
    expect(result).toMatchObject({ status: "uncertain", blocking: false })
    expect(parseAgyVisionVerdict("needs another look")).toBe("uncertain")
    expect(parseAgyVisionVerdict("FAIL: mismatch")).toBe("fail")
  })
})
