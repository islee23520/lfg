import { execFile } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("assert-npm-pack-bin integration (#22)", () => {
  test("npm run assert-pack exits 0 with bin.lfg in dry-run pack", async () => {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "assert-pack"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 2_000_000,
    })
    const combined = `${stdout}\n${stderr}`
    expect(combined).toContain("assert-npm-pack-bin: ok")
    expect(combined).toMatch(/assert-npm-pack-bin: ok @\d+\.\d+\.\d+/)
    expect(combined).toContain("@")
    expect(combined).toMatch(/prepack|build\.mjs/)
    expect(combined).toMatch(/islee23520-lfg-/)
  }, 60_000)
})