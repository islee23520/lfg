import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { DEPRECATED_SETUP_JSON_KEYS, findDeprecatedSetupJsonKeys } from "./setup-json-contract"

describe("lfg-installer setup JSON shape (#21)", () => {
  test("installJson source never references deprecated setup keys", async () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "lfg-installer.ts")
    const src = await readFile(path, "utf8")
    for (const key of DEPRECATED_SETUP_JSON_KEYS) {
      expect(src).not.toContain(`"${key}"`)
    }
    expect(src).toContain("postInstallVerify")
  })

  test("canonical success fields omit deprecated keys", () => {
    const sample = {
      ok: true,
      postInstallVerify: { ok: true, status: "verified" },
      installers: [],
      grokInstallerCommand: "@islee23520/lfg internal grok-install",
    }
    expect(findDeprecatedSetupJsonKeys(sample)).toEqual([])
    expect(sample.grokInstallerCommand).toContain("internal grok-install")
  })
})