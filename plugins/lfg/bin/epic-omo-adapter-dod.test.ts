import { access } from "node:fs/promises"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

/** Epic #26 — in-repo Definition of Done gate (plans/lfg-omo-grok-adapter.md). */
describe("epic #26 adapter DoD", () => {
  test("plan evidence completed and ownership ADR present", async () => {
    const bundle = JSON.parse(
      await readFile(join(ROOT, ".omo/plan-evidence/lfg-omo-grok-adapter.json"), "utf8"),
    ) as { status?: string; epicIssue?: number; planPath?: string }
    expect(bundle.epicIssue).toBe(26)
    expect(bundle.planPath).toBe("plans/lfg-omo-grok-adapter.md")
    expect(bundle.status).toBe("completed")
    const adr = await readFile(join(ROOT, "docs/grok-adapter-ownership.md"), "utf8")
    expect(adr).toContain("lfgIsPlugin: false")
    expect(adr).toContain("npx @islee23520/lfg setup")
    await expect(access(join(ROOT, "plugins/lfg/lfp"))).rejects.toThrow()
  })

  test("installer source uses internal grok install not lfp npx", async () => {
    const src = await readFile(join(ROOT, "plugins/lfg/bin/lfg-installer.ts"), "utf8")
    expect(src).toContain("runGrokInstall")
    expect(src).not.toContain("writeGrokModelConfig")
    expect(src).not.toContain("@islee23520/lfp")
  })
})