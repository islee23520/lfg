import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL(".", import.meta.url))

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== "fixture-minimal") {
      files.push(...(await collectTsFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path)
    }
  }
  return files
}

describe("grok-install branding (plan DoD)", () => {
  test("shipped grok-install sources contain no linalab", async () => {
    const files = await collectTsFiles(ROOT)
    expect(files.length).toBeGreaterThan(0)
    for (const path of files) {
      const text = await readFile(path, "utf8")
      expect(text.toLowerCase()).not.toContain("linalab")
    }
  })
})