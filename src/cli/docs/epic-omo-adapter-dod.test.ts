import { access } from "node:fs/promises"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const EVIDENCE = join(ROOT, ".omo/plan-evidence/lfg-omo-grok-adapter.json")

/** Epic #26 — in-repo Definition of Done gate (plans/lfg-omo-grok-adapter.md). */
describe("epic #26 adapter DoD", () => {
  // `.omo/` is gitignored; skip this local-evidence check in CI where the bundle is absent.
  test.skipIf(!existsSync(EVIDENCE))("plan evidence completed and ownership ADR present", async () => {
    const bundle = JSON.parse(
      await readFile(join(ROOT, ".omo/plan-evidence/lfg-omo-grok-adapter.json"), "utf8"),
    ) as { status?: string; epicIssue?: number; planPath?: string }
    expect(bundle.epicIssue).toBe(26)
    expect(bundle.planPath).toBe("plans/lfg-omo-grok-adapter.md")
    expect(bundle.status).toBe("completed")
    const adr = await readFile(join(ROOT, "docs/grok-adapter-ownership.md"), "utf8")
    expect(adr).toContain("lfg as Grok plugin")
    expect(adr).toContain("npx @islee23520/lfg setup")
    await expect(access(join(ROOT, "src/lfp"))).rejects.toThrow()
  })

  test("installer source uses internal grok install not lfp npx", async () => {
    const src = await readFile(join(ROOT, "src/cli/setup/lfg-installer.ts"), "utf8")
    expect(src).toContain("runGrokInstall")
    expect(src).not.toContain("writeGrokModelConfig")
    expect(src).not.toContain("@islee23520/lfp")
  })

  test("publish contract doc ready for owner npm publish (#22 follow-up)", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { version?: string; bin?: { lfg?: string } }
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.bin?.lfg).toBe("bin/lfg.js")
    const pub = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8")
    expect(pub).toContain("bin/lfg.js")
    expect(pub).toContain("closes #22")
  })
})