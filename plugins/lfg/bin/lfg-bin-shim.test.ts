import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

describe("plugins/lfg/lfg bin shim (#22)", () => {
  test("shell wrapper execs dist/lfg.js", async () => {
    const shim = await readFile(join(fileURLToPath(new URL("..", import.meta.url)), "lfg"), "utf8")
    expect(shim).toContain("dist/lfg.js")
    expect(shim).toContain("exec node")
  })
})