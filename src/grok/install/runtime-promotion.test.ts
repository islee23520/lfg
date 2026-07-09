import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  commitRuntimePromotion,
  cleanupCommittedRuntimePromotion,
  normalizeRuntimeEntry,
  prepareRuntimePromotion,
  rollbackRuntimePromotion,
} from "./runtime-promotion"

const temps: string[] = []

afterEach(() => {
  for (const root of temps.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-runtime-promo-"))
  temps.push(root)
  return root
}

describe("runtime-promotion (LFP parity)", () => {
  test("normalizeRuntimeEntry accepts string and optional object forms", () => {
    expect(normalizeRuntimeEntry("hooks")).toEqual({ path: "hooks", optional: false })
    expect(normalizeRuntimeEntry({ path: "dist", optional: true })).toEqual({ path: "dist", optional: true })
  })

  test("prepare+commit promotes staged package entries into pluginRoot", () => {
    const root = makeRoot()
    const packageRoot = join(root, "pkg")
    const pluginRoot = join(root, "home", ".grok", "plugins", "lfg")
    mkdirSync(join(packageRoot, "hooks"), { recursive: true })
    writeFileSync(join(packageRoot, "hooks", "h.js"), "export const n=1\n", "utf8")
    writeFileSync(join(packageRoot, "package.json"), '{"name":"lfg","version":"2.0.0"}\n', "utf8")
    mkdirSync(pluginRoot, { recursive: true })
    writeFileSync(join(pluginRoot, "package.json"), '{"name":"lfg","version":"1.0.0"}\n', "utf8")

    const promotion = prepareRuntimePromotion(packageRoot, pluginRoot, [
      "hooks",
      "package.json",
      { path: "dist", optional: true },
    ])
    expect(existsSync(join(promotion.tempRoot, "hooks", "h.js"))).toBe(true)
    expect(existsSync(join(promotion.tempRoot, "dist"))).toBe(false)

    commitRuntimePromotion(promotion)

    expect(existsSync(promotion.tempRoot)).toBe(false)
    expect(existsSync(promotion.backupRoot)).toBe(true)
    expect(readFileSync(join(pluginRoot, "package.json"), "utf8")).toContain("2.0.0")
    expect(readFileSync(join(pluginRoot, "hooks", "h.js"), "utf8")).toContain("export const n=1")

    rollbackRuntimePromotion(promotion)

    expect(existsSync(promotion.backupRoot)).toBe(false)
    expect(readFileSync(join(pluginRoot, "package.json"), "utf8")).toContain("1.0.0")
  })

  test("cleanupCommittedRuntimePromotion removes backup only after install success", () => {
    const root = makeRoot()
    const packageRoot = join(root, "pkg")
    const pluginRoot = join(root, "plugin")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, "package.json"), '{"v":2}\n', "utf8")
    mkdirSync(pluginRoot, { recursive: true })
    writeFileSync(join(pluginRoot, "package.json"), '{"v":1}\n', "utf8")

    const promotion = prepareRuntimePromotion(packageRoot, pluginRoot, ["package.json"])
    commitRuntimePromotion(promotion)
    expect(existsSync(promotion.backupRoot)).toBe(true)

    cleanupCommittedRuntimePromotion(promotion)

    expect(existsSync(promotion.backupRoot)).toBe(false)
    expect(readFileSync(join(pluginRoot, "package.json"), "utf8")).toContain('"v":2')
  })

  test("rollbackRuntimePromotion removes committed fresh pluginRoot when no backup existed", () => {
    const root = makeRoot()
    const packageRoot = join(root, "pkg")
    const pluginRoot = join(root, "plugin")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, "package.json"), '{"v":2}\n', "utf8")

    const promotion = prepareRuntimePromotion(packageRoot, pluginRoot, ["package.json"])
    commitRuntimePromotion(promotion)
    expect(existsSync(pluginRoot)).toBe(true)
    expect(existsSync(promotion.backupRoot)).toBe(false)

    rollbackRuntimePromotion(promotion)

    expect(existsSync(pluginRoot)).toBe(false)
    expect(existsSync(promotion.backupRoot)).toBe(false)
  })

  test("rollbackRuntimePromotion preserves existing pluginRoot when commit never happened", () => {
    const root = makeRoot()
    const packageRoot = join(root, "pkg")
    const pluginRoot = join(root, "plugin")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, "package.json"), '{"v":2}\n', "utf8")
    mkdirSync(pluginRoot, { recursive: true })
    writeFileSync(join(pluginRoot, "package.json"), '{"v":1}\n', "utf8")

    const promotion = prepareRuntimePromotion(packageRoot, pluginRoot, ["package.json"])

    rollbackRuntimePromotion(promotion)

    expect(existsSync(pluginRoot)).toBe(true)
    expect(readFileSync(join(pluginRoot, "package.json"), "utf8")).toContain('"v":1')
    expect(existsSync(promotion.backupRoot)).toBe(false)
  })

  test("rollbackRuntimePromotion restores pluginRoot from backup after mid-commit failure shape", () => {
    const root = makeRoot()
    const packageRoot = join(root, "pkg")
    const pluginRoot = join(root, "plugin")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, "package.json"), '{"v":2}\n', "utf8")
    mkdirSync(pluginRoot, { recursive: true })
    writeFileSync(join(pluginRoot, "package.json"), '{"v":1}\n', "utf8")

    const promotion = prepareRuntimePromotion(packageRoot, pluginRoot, ["package.json"])
    renameSync(pluginRoot, promotion.backupRoot)

    rollbackRuntimePromotion(promotion)

    expect(existsSync(promotion.tempRoot)).toBe(false)
    expect(existsSync(pluginRoot)).toBe(true)
    expect(readFileSync(join(pluginRoot, "package.json"), "utf8")).toContain('"v":1')
  })

  test("prepareRuntimePromotion skips optional missing entries and fails closed on required missing", () => {
    const root = makeRoot()
    const packageRoot = join(root, "pkg")
    const pluginRoot = join(root, "plugin")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, "package.json"), "{}\n", "utf8")

    const ok = prepareRuntimePromotion(packageRoot, pluginRoot, [
      "package.json",
      { path: "missing-optional", optional: true },
    ])
    expect(existsSync(join(ok.tempRoot, "package.json"))).toBe(true)
    rmSync(ok.tempRoot, { recursive: true, force: true })

    expect(() =>
      prepareRuntimePromotion(packageRoot, pluginRoot, ["package.json", "required-missing"]),
    ).toThrow()
  })
})
