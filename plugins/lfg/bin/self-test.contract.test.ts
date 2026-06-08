import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

describe("self-test.ts contract (#22)", () => {
  test("checks setup, internal grok-install, doctor; rejects dry-setup", async () => {
    const path = join(fileURLToPath(new URL(".", import.meta.url)), "self-test.ts")
    const src = await readFile(path, "utf8")
    expect(src).toContain("internal grok-install")
    expect(src).toContain("lazycodex-ai install")
    expect(src).toContain('"command": "doctor"')
    expect(src).toContain("dry-setup")
    expect(src).not.toContain("@islee23520/lfp")
  })
})