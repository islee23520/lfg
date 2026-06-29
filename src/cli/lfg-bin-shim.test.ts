import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { PUBLISHED_LFG_BIN_TARGET } from "./publish/bin/npm-publish-bin"

describe("bin/lfg.js bin shim (#22)", () => {
  test("shell wrapper execs dist/lfg.js", async () => {
    const shim = await readFile(join(fileURLToPath(new URL("../..", import.meta.url)), "bin", "lfg.js"), "utf8")
    expect(shim).toContain("dist/lfg.js")
    expect(shim).toContain("exec node")
    expect(shim).toContain('while [ -L "$target" ]')
    expect(shim).toContain("readlink")
    expect(shim).toContain("@islee23520/lfg/dist/lfg.js")
    expect(shim).toContain('$script_dir/../dist/lfg.js')
    expect(shim).toMatch(/set -eu/)
    expect(PUBLISHED_LFG_BIN_TARGET).toBe("bin/lfg.js")
    expect(shim).toContain("dist/lfg.js")
  })
})
