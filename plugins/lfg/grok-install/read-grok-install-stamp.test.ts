import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { readGrokInstallStamp } from "./install"

describe("readGrokInstallStamp", () => {
  test("returns null when stamp missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-stamp-miss-"))
    expect(await readGrokInstallStamp(root)).toBeNull()
  })

  test("returns null for invalid JSON shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-stamp-bad-"))
    await writeFile(join(root, "lfg-install.json"), '{"packageName":1}\n', "utf8")
    expect(await readGrokInstallStamp(root)).toBeNull()
  })
})