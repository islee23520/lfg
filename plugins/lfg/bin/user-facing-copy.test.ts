import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))

/** Epic #33 — ADR-aligned user-facing surfaces. */
describe("user-facing copy (#33)", () => {
  test("root package.json description is omo Grok adapter default path", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { description?: string }
    expect(pkg.description).toContain("Grok Build adapter")
    expect(pkg.description).toContain("grok-install")
    expect(pkg.description).not.toContain("npx @islee23520/lfp setup")
  })

  test("plugins/lfg README links parity doc and deprecates LFP default", async () => {
    const readme = await readFile(join(ROOT, "plugins/lfg/README.md"), "utf8")
    expect(readme).toContain("grok-adapter-parity.md")
    expect(readme).toContain("not required on the default path")
    expect(readme).toContain("internal")
  })

  test("canonical plan doc exists for ULW execution", async () => {
    const plan = await readFile(join(ROOT, "plans/lfg-omo-grok-adapter.md"), "utf8")
    expect(plan).toContain("runGrokInstall")
    expect(plan).toContain("lfgIsPlugin: false")
  })
})