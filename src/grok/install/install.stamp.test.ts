import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "../payload/install"

describe("lfg-install.json stamp", () => {
  test("writes grok platform stamp for parity row", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-stamp-"))
    const source = join(import.meta.dirname, "..", "fixture")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "2.0.0" })
    const raw = await readFile(join(home, ".grok", "plugins", "lfg", "lfg-install.json"), "utf8")
    const stamp = JSON.parse(raw) as { packageName: string; version: string; platform: string }
    expect(stamp).toEqual({ packageName: "@islee23520/lfg", version: "2.0.0", platform: "grok" })
  })
})