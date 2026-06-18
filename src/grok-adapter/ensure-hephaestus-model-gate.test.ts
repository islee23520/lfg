import { describe, expect, test } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureHephaestusModelGate } from "./ensure-hephaestus-model-gate"

const ORIGINAL_FRONTMATTER = `---
description: OMO Hephaestus baseline discipline for Codex
alwaysApply: true
---

You are Hephaestus, an autonomous deep worker based on GPT-5.5.`

const RULES_DIR = join("components", "rules", "bundled-rules")

function makePluginRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-heph-gate-test."))
  mkdirSync(join(root, RULES_DIR), { recursive: true })
  return root
}

describe("ensureHephaestusModelGate", () => {
  test("returns retired success without patching frontmatter when gate is absent", async () => {
    const root = makePluginRoot()
    const hephPath = join(root, RULES_DIR, "hephaestus.md")
    writeFileSync(hephPath, ORIGINAL_FRONTMATTER, "utf8")
    try {
      const result = await ensureHephaestusModelGate(root)
      expect(result.ensured).toBe(true)
      expect(result.patched).toBe(false)
      expect(result.reason).toContain("not default")
      expect(readFileSync(hephPath, "utf8")).toBe(ORIGINAL_FRONTMATTER)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("returns retired success without patching when models gate already present", async () => {
    const root = makePluginRoot()
    const hephPath = join(root, RULES_DIR, "hephaestus.md")
    const alreadyPatched = ORIGINAL_FRONTMATTER.replace(
      "alwaysApply: true",
      "alwaysApply: true\nmodels:\n  - gpt-5*",
    )
    writeFileSync(hephPath, alreadyPatched, "utf8")
    try {
      const result = await ensureHephaestusModelGate(root)
      expect(result.ensured).toBe(true)
      expect(result.patched).toBe(false)
      expect(result.reason).toContain("not default")
      const content = readFileSync(hephPath, "utf8")
      // Should be unchanged
      expect(content).toBe(alreadyPatched)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("returns retired success when hephaestus.md not found", async () => {
    const root = makePluginRoot()
    try {
      const result = await ensureHephaestusModelGate(root)
      expect(result.ensured).toBe(true)
      expect(result.patched).toBe(false)
      expect(result.reason).toContain("not default")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
