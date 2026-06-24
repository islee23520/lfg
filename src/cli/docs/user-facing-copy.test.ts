import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const DEPRECATED_IDENTITY_COPY = new RegExp(
  [
    "not a Grok " + "plugin",
    "not a Grok " + "plugin/runtime",
    "setup helper/adapter " + "package only",
  ].join("|"),
)

/** Epic #33 — ADR-aligned user-facing surfaces. */
describe("user-facing copy (#33)", () => {
  test("root package.json description is omo Grok adapter default path", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { description?: string }
    expect(pkg.description).toContain("GrokBuild port")
    expect(pkg.description).toContain("Grok Build plugin payload")
    expect(pkg.description).toContain("~/.grok/plugins/lfg")
    expect(pkg.description).not.toContain("npx @islee23520/lfp setup")
    expect(pkg.description).not.toMatch(DEPRECATED_IDENTITY_COPY)
  })

  test("src README describes Grok-first install without Codex npx default", async () => {
    const readme = await readFile(join(ROOT, "README.md"), "utf8")
    expect(readme).toContain("~/.grok")
    expect(readme).toContain(".")
    expect(readme).toContain("omo/lazycodex Grok Build plugin")
    expect(readme).toContain("GrokBuild port")
    expect(readme).toContain("codex adapter")
    expect(readme).toContain("opencode")
    expect(readme).toContain("언제 무엇을 실행하면 되나")
    expect(readme).not.toContain("full OMO surface")
    expect(readme).not.toContain("full OMO plugin surface")
    expect(readme).not.toContain("npx @islee23520/lfp setup")
    expect(readme).not.toMatch(DEPRECATED_IDENTITY_COPY)
  })

  test("lfg skill documents purpose and setup rhythm for agents", async () => {
    const skill = await readFile(join(ROOT, "skills/lfg/SKILL.md"), "utf8")
    expect(skill).toContain("name: lfg")
    expect(skill).toContain("언제 어떤 명령")
    expect(skill).toContain("GrokBuild port")
    expect(skill).toContain("Grok Build plugin payload")
    expect(skill).toContain("npx @islee23520/lfg setup")
    expect(skill).not.toContain("npx @islee23520/lfp setup")
    expect(skill).not.toMatch(DEPRECATED_IDENTITY_COPY)
  })

  test("canonical plan doc exists for ULW execution", async () => {
    const plan = await readFile(join(ROOT, "plans/lfg-omo-grok-adapter.md"), "utf8")
    expect(plan).toContain("runGrokInstall")
    // historical plan doc still contains the old lfgIsPlugin note; acceptable for now
  })

  test("nested src package.json description matches omo adapter (no LFP default)", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { description?: string }
    expect(pkg.description).toContain("GrokBuild port")
    expect(pkg.description).toContain("Grok Build plugin payload")
    expect(pkg.description).not.toContain("npx @islee23520/lfp setup")
  })

  test("user-facing identity copy rejects legacy negative plugin framing", async () => {
    const copyFiles = [
      "README.md",
      "package.json",
      "docs/grok-adapter-ownership.md",
      "docs/grok-adapter-parity.md",
      "skills/lfg/SKILL.md",
      "skills/lfp/SKILL.md",
      "skills/lazycodex/SKILL.md",
    ] as const

    for (const file of copyFiles) {
      const text = await readFile(join(ROOT, file), "utf8")
      expect(text, file).not.toMatch(DEPRECATED_IDENTITY_COPY)
    }
  })

  test("grok-adapter-parity.md syncs core rows to Implemented (not pending)", async () => {
    const parity = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")
    expect(parity).toContain("grok-adapter-ownership.md")
    expect(parity).toMatch(/\| Plugin cache install \|.*\| Implemented/)
    expect(parity).toMatch(/\| Internal verifier \|.*\| Implemented/)
    expect(parity).toMatch(/\| ulw-loop \/ start-work skills \|.*\| Implemented/)
    expect(parity).toContain("project `.omo` ledger")
    expect(parity).not.toMatch(/\| Plugin cache install \|.*\| pending/)
    expect(parity).not.toMatch(/\| Internal verifier \|.*\| pending/)
  })
})
