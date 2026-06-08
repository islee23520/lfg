import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

describe("package version sync (#22 publish)", () => {
  test("root and plugins/lfg package.json share same semver", async () => {
    const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { version: string }
    const workspace = JSON.parse(await readFile(join(ROOT, "plugins/lfg/package.json"), "utf8")) as { version: string }
    expect(root.version).toBe(workspace.version)
    expect(root.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})