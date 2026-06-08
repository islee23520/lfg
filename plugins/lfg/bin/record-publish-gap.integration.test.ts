import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("record-publish-gap integration (#22)", () => {
  test("npm run record-publish-gap builds dist and prints gap JSON with evidencePath", async () => {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "record-publish-gap"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 2_000_000,
    })
    const combined = `${stdout}\n${stderr}`
    expect(combined).toContain("build.mjs")
    const line = stdout
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("{") && l.includes("evidencePath"))
    expect(line).toBeDefined()
    const payload = JSON.parse(line!) as {
      hasBin: boolean
      publishReady: boolean
      evidencePath: string
      bin: { lfg?: string } | null
    }
    expect(payload.hasBin).toBe(true)
    expect(payload.publishReady).toBe(true)
    expect(payload.bin?.lfg).toBe("plugins/lfg/lfg")
    expect(payload.evidencePath).toContain("ulw-loop/evidence/publish-gap-")
  }, 60_000)
})