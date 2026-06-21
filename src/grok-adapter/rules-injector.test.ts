import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { buildRuleContext } from "./rules-injector"

async function createHermeticProject(prefix: string): Promise<{ readonly cwd: string; readonly homeDir: string }> {
  const cwd = await mkdtemp(join(tmpdir(), prefix))
  const homeDir = await mkdtemp(join(tmpdir(), `${prefix}home-`))
  return { cwd, homeDir }
}

describe("buildRuleContext", () => {
  test("returns empty block when no rules or AGENTS.md exist", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-empty-")
    const result = await buildRuleContext({ cwd, currentFile: join(cwd, "src", "main.ts"), homeDir })
    expect(result.contextBlock).toBe("")
    expect(result.matchedCount).toBe(0)
    expect(result.agentsMdCount).toBe(0)
  })

  test("discovers AGENTS.md on the upward walk from the touched file", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-agents-")
    await mkdir(join(cwd, "src", "deep"), { recursive: true })
    await mkdir(join(cwd, ".git"), { recursive: true })
    await writeFile(join(cwd, "AGENTS.md"), "# Project Rules\n\nUse strict TypeScript.\n")
    await writeFile(join(cwd, "src", "main.ts"), "export const x = 1\n")
    const result = await buildRuleContext({ cwd, currentFile: join(cwd, "src", "deep", "file.ts"), homeDir })
    expect(result.agentsMdCount).toBeGreaterThanOrEqual(1)
    expect(result.contextBlock).toContain("[AGENTS.md:")
    expect(result.contextBlock).toContain("Use strict TypeScript.")
  })

  test("matches rules by glob and formats with [Rule:] header", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-glob-")
    await mkdir(join(cwd, ".claude", "rules"), { recursive: true })
    await mkdir(join(cwd, "src"), { recursive: true })
    await mkdir(join(cwd, ".git"), { recursive: true })
    await writeFile(join(cwd, ".claude", "rules", "ts-strict.md"), "---\nglobs: \"**/*.ts\"\n---\n# TS Rule\n\nNever use any.\n")
    await writeFile(join(cwd, "src", "main.ts"), "export const x = 1\n")
    const result = await buildRuleContext({ cwd, currentFile: join(cwd, "src", "main.ts"), homeDir })
    expect(result.matchedCount).toBeGreaterThanOrEqual(1)
    expect(result.contextBlock).toContain("[Rule:")
    expect(result.contextBlock).toContain("Never use any.")
  })

  test("does not match rules whose globs do not cover the file", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-noglob-")
    await mkdir(join(cwd, ".claude", "rules"), { recursive: true })
    await mkdir(join(cwd, "src"), { recursive: true })
    await mkdir(join(cwd, ".git"), { recursive: true })
    await writeFile(join(cwd, ".claude", "rules", "python-only.md"), "---\nglobs: \"**/*.py\"\n---\n# Py Rule\n\nUse type hints.\n")
    await writeFile(join(cwd, "src", "main.ts"), "export const x = 1\n")
    const result = await buildRuleContext({ cwd, currentFile: join(cwd, "src", "main.ts"), homeDir })
    expect(result.matchedCount).toBe(0)
    expect(result.contextBlock).not.toContain("Py Rule")
  })

  test("deduplicates rules by content hash", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-dedup-")
    await mkdir(join(cwd, ".claude", "rules"), { recursive: true })
    await mkdir(join(cwd, "src"), { recursive: true })
    await mkdir(join(cwd, ".git"), { recursive: true })
    // Two rule files with identical content (same hash).
    const identical = "---\nglobs: \"**/*.ts\"\n---\n# Identical\n\nSame content here.\n"
    await writeFile(join(cwd, ".claude", "rules", "a.md"), identical)
    await writeFile(join(cwd, ".claude", "rules", "b.md"), identical)
    await writeFile(join(cwd, "src", "main.ts"), "export const x = 1\n")
    const result = await buildRuleContext({ cwd, currentFile: join(cwd, "src", "main.ts"), homeDir })
    // Only one of the duplicates is injected.
    const occurrences = (result.contextBlock.match(/Identical/g) ?? []).length
    expect(occurrences).toBe(1)
  })

  test("alwaysApply rules match every file", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-always-")
    await mkdir(join(cwd, ".claude", "rules"), { recursive: true })
    await mkdir(join(cwd, "src"), { recursive: true })
    await mkdir(join(cwd, ".git"), { recursive: true })
    await writeFile(join(cwd, ".claude", "rules", "always.md"), "---\nalwaysApply: true\n---\n# Always\n\nBe concise.\n")
    await writeFile(join(cwd, "src", "main.ts"), "export const x = 1\n")
    const result = await buildRuleContext({ cwd, currentFile: join(cwd, "src", "main.ts"), homeDir })
    expect(result.matchedCount).toBeGreaterThanOrEqual(1)
    expect(result.contextBlock).toContain("Be concise.")
  })

  test("respects injected readFile for hermetic testing", async () => {
    const { cwd, homeDir } = await createHermeticProject("lfg-rules-injected-")
    await mkdir(join(cwd, ".claude", "rules"), { recursive: true })
    await mkdir(join(cwd, "src"), { recursive: true })
    await mkdir(join(cwd, ".git"), { recursive: true })
    await writeFile(join(cwd, ".claude", "rules", "ts.md"), "---\nglobs: \"**/*.ts\"\n---\nReal body.\n")
    const fake = async () => "---\nglobs: \"**/*.ts\"\n---\nFAKE BODY\n"
    const result = await buildRuleContext({
      cwd,
      currentFile: join(cwd, "src", "main.ts"),
      homeDir,
      readFile: fake,
    })
    expect(result.contextBlock).toContain("FAKE BODY")
  })
})
