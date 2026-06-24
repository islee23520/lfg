import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { readGrokInstallStamp } from "../payload/install"

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

  test("reads packageName and version when platform grok present (#27)", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-stamp-ok-"))
    await writeFile(
      join(root, "lfg-install.json"),
      `${JSON.stringify({ packageName: "@islee23520/lfg", version: "0.1.4", platform: "grok" }, null, 2)}\n`,
      "utf8",
    )
    expect(await readGrokInstallStamp(root)).toEqual({ packageName: "@islee23520/lfg", version: "0.1.4" })
  })
})